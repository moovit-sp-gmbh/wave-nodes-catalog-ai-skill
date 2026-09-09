# The `this.wave` runtime surface

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below. Run `scripts/engine-surface.mjs` to print the exact helper method signatures the installed `node_modules/wave-engine` exposes — it's the fastest way to check whether a method mentioned below still exists.

## When to use

Whenever you're inside `execute()` and need to read inputs, write outputs, log progress, check for cancellation, hit an HTTP endpoint, touch the filesystem, or reach helmut.cloud. The injected `this.wave` is your entire I/O surface — you don't import the engine, you don't `new` anything, you read from `this.wave.*`.

## Concept

The wave-engine attaches a `Wave` instance to every node at runtime (the abstract `Node` class declares it via `wave!: Wave`). The instance exposes namespaces, each a class with cleanly-typed methods.

**The exact surface depends on the engine version targeted in Step 1 of the workflow.** New helpers are added between versions; old ones occasionally get renamed or removed. Don't author code against a helper from memory — verify it's present in the engine version you're targeting by reading `node_modules/wave-engine/helpers/Wave.d.ts` (types) or `node_modules/wave-engine/helpers/Wave.js` (implementation), or by running `scripts/engine-surface.mjs`, which prints every public method signature on the installed `Wave` helper classes.

**Use what the engine offers, in preference to reimplementing.** The whole point of these helpers is to avoid every catalog rewriting curl conversion, file-copy progress reporting, MD5 hashing, retry logic, etc. Before reaching for a new npm package or `node:fs`, scan `Wave.ts` for an existing helper.

The shape below is what recent production engines expose — verify per your target version.

```typescript
this.wave.general                 // execution metadata, cancellation, hcloud client
this.wave.inputs                  // input value access
this.wave.outputs                 // output writes + additional connector execution
this.wave.logger                  // progress + status message + node-level logs
this.wave.fileAndFolderHelper     // filesystem operations with duplicate-handling
this.wave.axiosHelper             // HTTP requests + curl conversion + payload cleanup
```

Below: typical methods you'll find on each namespace, what they do, and when to reach for them.

## `wave.general`

Source: `node_modules/wave-engine/helpers/Wave.js` — look for `class General`.

| Method | Signature | Use |
|---|---|---|
| `getNodeUuid()` | `() => string` | The node's unique ID in the stream. Needed for the wildcard-resolver to refer to *this* node's outputs. |
| `getNodeSpecification()` | `() => StreamNodeSpecification` | The fully-resolved spec object for this node instance. |
| `resolveValue(value)` | `(string) => unknown` | Resolve a wildcard expression (`{{OUTPUT.<uuid>.field}}`) on demand. Inputs are already resolved by the time you read them — use this only for dynamic resolution. Returns a number if the resolved value parses as one, otherwise a string. |
| `isCanceled()` | `() => boolean` | Check whether the execution has been canceled. Poll this from long-running loops; throw on true and abort in-flight work. |
| `cancelExecution()` | `() => void` | Set the overall execution state to CANCELED. **Stop your async work first** — this doesn't kill anything by itself. |
| `getHcloudClient()` | `() => HCloud` | The pre-authenticated hcloud-sdk client. Use this for *every* helmut.cloud interaction (see `hcloud-sdk-usage.md`). |
| `getOrgName()` | `() => string` | Organization name from the execution request. |
| `getSpaceName()` | `() => string` | High5 space name from the execution request. |
| `setStreamMessage(message)` | `(string) => void` | Updates the stream-level dashboard message. Different from `logger.updateMessage` (which is node-level). |

**`getAgentContext()` and `isDebug()` do not exist on the installed `General` helper `(engine, verified 2.0.1 and the published 3.0.0 typings)`.** `node_modules/wave-engine/helpers/Wave.d.ts` declares `General` with exactly the methods in the table above — no agent-context accessor and no debug-flag accessor. An unreleased/newer engine checkout may add both, so don't assume either is absent forever — before depending on one, run `scripts/engine-surface.mjs` against the engine version you're actually targeting and confirm it's listed.

## `wave.inputs`

Source: `node_modules/wave-engine/helpers/Wave.js` — look for `class Inputs`.

| Method | Signature | Use |
|---|---|---|
| `getInputs()` | `() => StreamNodeResolvedInput[]` | All inputs with resolved values. Rarely needed — usually you want a single named input. |
| `getInputByName(name)` | `(string) => StreamNodeResolvedInput \| undefined` | The full input object (resolved value + metadata). Case-insensitive lookup. |
| `getPreresolvedInputByName(name)` | `(string) => StreamNodeSpecificationInput \| undefined` | The spec-side input (before wildcard resolution). For inspecting type/example/description. |
| **`getInputValueByInputName(name)`** | `(string) => any` | **The one you'll use 99% of the time.** Returns the resolved, type-coerced input value. Cast to your declared type. |
| `getInputOriginalValueByInputName(name)` | `(string) => any` | The pre-wildcard-resolution value. Use only if you need the literal `{{...}}` template. |

**Idiom:**

```typescript
const url = this.wave.inputs.getInputValueByInputName(Input.URL) as string;
const timeout = this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) as number;
const headers = this.wave.inputs.getInputValueByInputName(Input.HEADERS) as Record<string, string>;
```

Values arrive *already type-coerced* — see `input-coercion.md` for what the engine does.

## `wave.outputs`

Source: `node_modules/wave-engine/helpers/Wave.js` — look for `class Outputs`.

| Method | Signature | Use |
|---|---|---|
| `getAllOutputs()` | `() => StreamNodeOutput[]` | All outputs declared in the spec. |
| `getOutputByName(name)` | `(string) => StreamNodeOutput \| undefined` | One output's metadata. Case-insensitive. |
| `getOutputValueByOutputName(name)` | `(string) => any` | Read an output you've already set. Useful for inspecting state inside `execute()`. |
| **`setOutput(name, value, type?)`** | `(string, any, OutputType?) => void` | **The one you'll use.** Sets or creates the named output. Optional `type` overrides the spec-declared type at the call site (useful when the output shape is dynamic). |
| `executeAdditionalConnector(name)` | `(string) => Promise<StreamResult \| undefined>` | Triggers a child node attached to the named additional connector. Returns its full execution result. Substreams inherit parent variables. See `additional-connectors.md`. |

**Idiom:**

```typescript
// Domain node — curated identifier + raw entity (typical case)
this.wave.outputs.setOutput(Output.TASK_ID, task.id);
this.wave.outputs.setOutput(Output.TASK, task);

// Dynamic type override at the call site (when the spec type isn't strict enough):
this.wave.outputs.setOutput(Output.TASK, task, StreamNodeSpecificationOutputType.JSON);
```

## `wave.logger`

Source: `node_modules/wave-engine/helpers/Wave.js` — look for `class Logger`.

| Method | Signature | Use |
|---|---|---|
| `getCurrentProgress()` | `() => number \| undefined` | Read back what you last set. |
| `getCurrentMessage()` | `() => string \| undefined` | Read back the current node-level status message. |
| `updateProgress(progress)` | `(number) => void` | Sets the node's runtime progress (0–100 by convention). Displayed in the high5 dashboard and the Stream Designer debugger — not on the design-canvas tile. |
| `updateMessage(message)` | `(string) => void` | Node-level status line ("Connecting…", "Downloading 4 of 7"). |
| `updateProgressAndMessage(progress, message)` | `(number, string) => void` | Atomic update of both. Preferred for long-running ops. |
| `addNodeLog(message)` | `(string) => void` | Append a log entry to this node's result. Shown per node in Stream Designer's execution view and pushed to helmut.cloud with the status patches; not written to any file. **Never log credentials or `STRING_PASSWORD` values — engine does not redact.** |

`console.log` / `console.error` aren't captured by the engine — they go to the Agent process's stdout, which the packaged Agent writes to `~/.hcloud/agent/agent.log`. Fine for a one-off local check; invisible from Stream Designer.

A `Progress` output only does anything paired with an additional connector on `Progress` (`additional-connectors.md`) — setting it alone reaches nobody.

**Idiom for a long-running operation:**

```typescript
this.wave.logger.updateProgressAndMessage(0, "Starting upload");
for (let i = 0; i < chunks.length; i++) {
    if (this.wave.general.isCanceled()) throw new Error("Upload canceled — user stopped the stream — no action needed");
    await uploadChunk(chunks[i]);
    this.wave.logger.updateProgressAndMessage(
        Math.floor(((i + 1) / chunks.length) * 100),
        `Uploaded ${i + 1} of ${chunks.length}`
    );
}
```

## `wave.fileAndFolderHelper`

Source: `node_modules/wave-engine/helpers/Wave.js` — look for `class FileAndFolderHelper`.

File ops accept a `DuplicateFileOption` value; folder ops accept a `DuplicateFolderOption` value. The two enums are **not** identical — confirmed against `node_modules/wave-engine/models/DuplicateFileOptionEnum.d.ts` and `DuplicateFolderOptionEnum.d.ts`:

- `DuplicateFileOption`: `FAIL`, `SKIP`, `OVERWRITE`, `RENAME_EXISTING`, `INCREMENT_NAME`.
- `DuplicateFolderOption`: `FAIL`, `SKIP`, `RENAME_EXISTING`, `INCREMENT_NAME` — **no `OVERWRITE` member.** There is no folder-level overwrite option; don't offer "Overwrite" in a `STRING_SELECT` backed by `DuplicateFolderOption`, and don't assume `copyFolder`/`moveFolder`/`createFolder` accept it.

| Method | Signature |
|---|---|
| `createFile(path, dupOpt)` | `(string, DuplicateFileOption) => Promise<string>` |
| `copyFile(src, dst, dupOpt, progressCb?, getMd5?, abort?)` | full progress + MD5 + cancellation support |
| `moveFile(...)` | same shape as copyFile |
| `renameFile(path, newName, dupOpt)` | `=> Promise<string>` |
| `deleteFile(path)` | `=> Promise<void>` |
| `createFolder(path, dupOpt)` / `copyFolder` / `moveFolder` / `renameFolder` / `deleteFolder` | parallel set |
| `getFileMd5Hash(path, signal?)` / `getFolderMd5Hash(path, signal?)` | `=> Promise<string>` — MD5 of file or recursive folder |

Progress callbacks fire at most once per second. Pass an `AbortSignal` to support cancellation cleanly.

**Idiom:**

```typescript
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";

const finalPath = await this.wave.fileAndFolderHelper.copyFile(
    sourcePath,
    destinationPath,
    DuplicateFileOption.INCREMENT_NAME,
    (bytes, total) => this.wave.logger.updateProgress(Math.floor((bytes / total) * 100)),
    false,
    controller.signal,
);
```

## `wave.axiosHelper`

Source of truth: `node_modules/wave-engine/helpers/Wave.js` (look for `class AxiosHelper`). Verify the contract against the installed engine version — surface details can shift between major versions.

### Methods

| Method | Signature | Use |
|---|---|---|
| `makeRequest(config)` | `(AxiosRequestConfig) => Promise<any>` | Send an HTTP request. **Returns the response body directly** (not an Axios response wrapper). On error throws `Error("Axios Error: <msg> (<status>)")`. Extracts `response.data.message` if present in the error body. |
| `convertRequestToCurl(config)` | `(AxiosRequestConfig) => string` | Convert the request to a copy-pasteable curl command. Use for the `Curl` output. **Does not support form data** — the JSDoc in `node_modules/wave-engine/helpers/Wave.d.ts` says so explicitly, and the implementation `JSON.stringify`s `config.data` for the `-d` flag, which produces a useless string for a `FormData`/multipart body. For a node whose request body is `multipart/form-data`, either skip the `Curl` output and say why in the wavedoc, or build a best-effort curl string by hand and note the limitation. |
| `removeEmptyFields(obj)` | `(Record<string, any>) => Record<string, any>` | Recursively strip `undefined`, `null`, empty strings, empty arrays, empty objects. Useful before sending an API payload to avoid sending blanks. |

### Contract — what `makeRequest` actually returns and throws `[Important — verify against the installed source]`

Verified against `node_modules/wave-engine/helpers/Wave.js` for the installed wave-engine 2.0.1:

```js
async makeRequest(config) {
    try {
        return (await axios.default(config)).data;   // returns body only — discards status/headers/statusText
    } catch (err) {
        if (axios.isAxiosError(err)) {
            throw new Error(`Axios Error: <message> (<status>)`);  // formatted from response.data.message or err.message
        } else {
            throw err;  // non-axios errors rethrown unmodified
        }
    }
}
```

**Success path:**
- Returns the **response body** directly (`response.data` from the underlying Axios call). **Not** an `AxiosResponse` wrapper — there is no `.status`, `.headers`, or `.statusText` on the returned value. The helper unconditionally discards them.
- Resolves only when the underlying call satisfies `validateStatus` (default: 2xx range — see below).

**Failure path:**
- Throws a plain `Error` with the message format `"Axios Error: <message> (<status>)"`. The status is suffixed in parentheses when known.
- The original Axios error metadata (headers, full response body, request config) is **not** surfaced on the thrown `Error` — only the formatted message string. If the API returns an error envelope with `response.data.message`, the helper includes it in the formatted message.
- Non-Axios errors (e.g. JS errors before the call) re-throw unmodified.

**`validateStatus` default:**
- Default is Axios's default — 2xx counted as success, everything else throws. The helper does not override this.
- Setting `validateStatus: () => true` suppresses the throw, but **the helper still returns body-only and still discards the status**. You cannot retrieve the HTTP status code via `makeRequest`, regardless of `validateStatus`.

**Cancellation:**
- `makeRequest` does not auto-cancel on `wave.general.isCanceled()`. If your node supports cancellation (Step 5 of the workflow), wire an `AbortController` into the request config's `signal` field and abort it from inside the cancellation loop. See `cancellation-and-async.md`.

### When you need the HTTP status code — bypass the helper

`makeRequest` is body-only by design. If your node intentionally exposes a `Status code` output (the documented exception to the "no Status code default" rule — see `naming-and-style.md`, "The anti-default to forbid by name"), you **MUST** bypass the helper and call raw `axios()` directly:

```typescript
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

const requestConfig: AxiosRequestConfig = {
    method: "POST",
    url,
    headers,
    data: body,
    timeout: timeout * 1000,
    validateStatus: failOnNon2xx ? undefined : () => true,
};

const response: AxiosResponse = await axios(requestConfig);

this.wave.outputs.setOutput(Output.STATUS_CODE, response.status);
this.wave.outputs.setOutput(Output.BODY, response.data);
this.wave.outputs.setOutput(
    Output.CURL,
    this.wave.axiosHelper.convertRequestToCurl(requestConfig),
);

if (failOnNon2xx && (response.status < 200 || response.status >= 300)) {
    throw new Error(
        `Could not POST to ${url} — server returned ${response.status} — verify the URL, payload, and the server's expected body shape`,
    );
}
```

You **still use** `axiosHelper.convertRequestToCurl()` for the `Curl` output — only `makeRequest` is bypassed. **Domain nodes that wrap a specific endpoint do not need this pattern** — they expose entity-meaningful outputs (`Task id`, `Task`, etc.) and throw on non-2xx via `makeRequest`'s default behavior.

### Pattern — domain node (the common case, uses `makeRequest`)

Use `makeRequest` when the node wraps a specific endpoint and exposes entity-meaningful outputs. Throw on non-2xx by default; no `Status code` output (per `naming-and-style.md` "The anti-default to forbid by name").

```typescript
const requestConfig: AxiosRequestConfig = {
    method: "POST",
    url: endpoint,
    headers: this.wave.axiosHelper.removeEmptyFields({
        Authorization: bearer && `Bearer ${bearer}`,
    }),
    data: this.wave.axiosHelper.removeEmptyFields(payload),
    timeout: timeout * 1000,
};

let task: TaskResponseShape;
try {
    task = await this.wave.axiosHelper.makeRequest(requestConfig);
} catch (err: unknown) {
    const message = (err as Error)?.message ?? "unknown error";
    throw new Error(
        `Could not create task — request failed: ${message} — verify the URL, payload, and credentials`,
    );
}

this.wave.outputs.setOutput(Output.TASK_ID, task.id);
this.wave.outputs.setOutput(Output.TASK, task);

// Redact credentials before emitting the curl
const safeCurl = this.wave.axiosHelper.convertRequestToCurl({
    ...requestConfig,
    headers: {
        ...requestConfig.headers,
        ...(bearer ? { Authorization: "Bearer <your-token>" } : {}),
    },
});
this.wave.outputs.setOutput(Output.CURL, safeCurl);
```

### Pattern — generic HTTP-client node (exposes `Status code`, bypasses `makeRequest`)

When a node intentionally exposes a `Status code` output — the documented exception, only valid for generic HTTP-client nodes that don't wrap a specific endpoint — use raw `axios()` (because `makeRequest` discards the status). Still use `axiosHelper.convertRequestToCurl()` for the `Curl` output. See the worked example earlier in this section ("When you need the HTTP status code — bypass the helper").

**The request body input on a generic HTTP-client node: `ANY` or `STRING_LONG`, both legitimate.** Which one depends on how the workflow engineer supplies the body, not a house-style default:

- **`ANY`** — when the caller may wire *any structure* from an upstream node's output (an object, a string, whatever that node produced) and this node should forward it as-is. `ANY`'s coercion rule is "no validation, whatever comes in is what you get" (`input-coercion.md`), so an object wired in stays an object — pass it straight into `data:` without touching it.
- **`STRING_LONG`** — when the workflow engineer types or pastes the JSON body by hand in Stream Designer. The engine `JSON.stringify`s any object wired into a `STRING_LONG` input, so parse it back out (`JSON.parse`) and validate the shape at the top of `execute()` before using it — same as any other `STRING_LONG`-holding-JSON input (`naming-and-style.md`, `input-type-rules.md#string-long`).

This doesn't contradict the "no `JSON` input type" rule: a domain node with a fixed, named structured field (a specific optional payload field on a specific endpoint) always uses `STRING_LONG` + parse — it has one shape, the engineer types it by hand, and there's no upstream node whose entire output this field is meant to forward untouched. `ANY` is only for the generic-client case where the node genuinely doesn't know the shape in advance.

**Verify before relying on a surface detail.** When in doubt, open `node_modules/wave-engine/helpers/Wave.js` and read the `AxiosHelper` class — the source is the contract, not this document.

## Anti-patterns

- **Reading inputs raw via `getInputs()` and indexing by position.** Always go by name. Positions can shift across spec edits.
- **`addNodeLog` of a `STRING_PASSWORD` value.** It surfaces the credential. Use a redacted placeholder if you must log around credential use.
- **`setStreamMessage` mistaken for `updateMessage`.** `setStreamMessage` is stream-wide; `updateMessage` is this-node-only. Pick the right scope.
- **Declaring a `Run time` output or wrapping `execute()` in `try/finally` solely to measure duration** — the engine emits `node.<uuid>.info.runTime` automatically. Use `try/finally` only for genuine cleanup (file handles, child processes, `onCleanup`).
- **Using raw `axios` (the package) instead of `wave.axiosHelper`.** The helper adds curl conversion and consistent error wrapping you'd otherwise reimplement.
- **Calling `cancelExecution()` without first stopping your async work.** The engine flags the execution as canceled but your timer / interval / HTTP request keeps running until it natively finishes.

## Curiosity hooks

- The `Wave` class is constructed once per node instance at runtime. Each invocation gets a fresh instance. Don't store mutable state on `this` across executions — your assumptions about lifecycle won't hold.
- `wave.general.resolveValue` is the same resolver used by the engine to pre-resolve inputs. Knowing it exists lets you build dynamic wildcards inside `execute()` if you must.
- `getHcloudClient()` returns the SDK client already configured with the auth token from the execution request. You don't pass credentials; you just use it.
