# Testing and debugging

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

After scaffolding a node. After modifying any helper logic. Before opening a PR. Any time the user reports unexpected behavior in the Stream Designer.

## Three layers of testing

In order from fastest feedback to slowest:

### 1. Unit tests on pure helpers (Jest)

The blueprint's `jest.config.js` is preconfigured. Tests live in `tests/nodes/<NodeName>.test.ts`. Some existing catalogs (e.g. `wave-nodes`) test with `node --test` plus `ts-node` instead of Jest; follow whatever `package.json`'s `test` script already uses — `scripts/verify.mjs` runs that script when Jest is not a declared dependency.

**Test pure functions, not `execute()`.** Extract parsers, validators, transformers, response shapers into module-level exported functions, or instance methods called via `this`. Test module-level functions directly; test instance methods through an instantiated node. Never call a static helper by the class's own name from inside the class body — see `no-class-self-reference` in `style/rules.json` — so prefer the module-level form; it's also the easiest to unit test since it needs no node instance at all.

Example:

```typescript
// lib/nodes/MyNode.ts
export function parseCsvRow(row: string, delimiter: string): string[] {
    // ...
}

// tests/nodes/MyNode.test.ts
import { parseCsvRow } from "../../lib/nodes/MyNode";

describe("parseCsvRow", () => {
    it("splits on the delimiter", () => {
        expect(parseCsvRow("a,b,c", ",")).toEqual(["a", "b", "c"]);
    });

    it("respects a custom delimiter", () => {
        expect(parseCsvRow("a|b|c", "|")).toEqual(["a", "b", "c"]);
    });

    it("handles a trailing empty field", () => {
        expect(parseCsvRow("a,b,", ",")).toEqual(["a", "b", ""]);
    });
});
```

Run: `npm test`.

**Failure-path tests — assert the throw, don't catch it.** A common bug: writing failure-path tests as `try { await fn(); } catch (e) { expect(e).toBeInstanceOf(Error); }`. When `fn()` *doesn't* throw, the `catch` block never runs, no assertion fires, and the test passes silently — exactly the opposite of what was intended. Use Jest's async matchers, which fail correctly in both directions:

```typescript
// Async function expected to reject:
await expect(MyNode.parseCsvRow("", ",")).rejects.toThrow(/empty input/);

// Sync function expected to throw:
expect(() => MyNode.parseCsvRow("", ",")).toThrow(/empty input/);
```

The regex form pins the test to a specific error message, catching both "didn't throw" and "threw the wrong error." If you genuinely need a `try/catch` (e.g., to inspect a custom error field like `err.code`), put `expect.assertions(N)` at the top of the test so a missing throw fails the test rather than passing it.

**What unit tests are good for:**

- Parsing logic.
- Validation rules.
- Response shaping (transforming an API response into your output structure).
- Edge-case enumeration (empty inputs, malformed data, off-by-one).

**What they don't cover:**

- Whether `this.wave.*` calls work as expected — that's integration.
- Whether the spec is well-formed — `npm run spec` covers that.
- Whether the stream wiring works in Stream Designer — that's dev-mode.

### 2. Stream simulation (in-repo framework)

The blueprint ships `tests/framework/index.ts` with `executeChain(engineVersions, payload, design)` for simulating a stream end-to-end without the Agent.

**Use this when:**

- You want to test how your node behaves when chained after another.
- You need to verify wildcard binding (`{{node.{uuid}.output.<name>}}`).
- You want to assert on outputs after a real `execute()` call.

The pattern (paraphrased from `tests/framework/example*.ts`):

```typescript
import { executeChain } from "../framework";

const design = {
    nodes: [
        {
            uuid: "node-1",
            className: "MyNode",
            inputs: [{ name: "Input name", value: "literal-value-or-wildcard" }],
            onSuccess: "node-2",
        },
        {
            uuid: "node-2",
            className: "OtherNode",
            inputs: [{ name: "Source", value: "{{node.node-1.output.Result}}" }],
        },
    ],
};

const result = await executeChain(["latest"], { payload: "anything" }, design);
// Assert on result.nodeResults, outputs, errors, etc.
```

This requires the wave-engine package and a compatible engine version locally. Reads more like an integration test than a unit test — slower, but real.

### 3. Dev-mode against the local Agent

This is how you test the node as a real user would see it in Stream Designer. Verified against `hcloud-agent-dev/backend/src/modules/dev-wave/index.ts`, `helper/WaveManager.ts` (`loadDevEngine`), `service/StreamService.ts`, and wave-engine `src/utils/NodeImport.ts` (`searchExtraCatalogs`, `initCatalogModule`).

**What "link" actually does.** `npm run link` calls the Agent's dev-wave module (`GET http://localhost:6968/api/agent/v1/modules/dev-wave/wave/debug?waveNodeFolder=<absolute repo path>`). The Agent stores that folder and, on every stream run, calls the engine's `runDev(...folders)` instead of `run()`. The engine then looks for a node first in the downloaded catalogs and then in each linked folder, where it loads `<folder>/src/catalog.ts` if present, otherwise `<folder>/bundle.js`. It evicts the module from `require.cache` before every load, so the file on disk is re-read on each run — **but nothing rebuilds it**. The Agent contains no esbuild. You must rebundle after every edit:

```bash
npm run bundle:debug      # esbuild with --sourcemap; use this while iterating
# or: npm run bundle      # no source map; what the release workflow runs
```

Calling `link` with an empty `waveNodeFolder` clears the list and the Agent goes back to the downloaded catalogs.

**Prerequisites**

- The helmut.cloud Agent installed, signed in to the organization, and running (system tray).
- The catalog repo with `npm install` done and a `bundle.js` present (`npm run bundle:debug`).

**Loop**

```bash
# once per Agent start
npm run link                     # 204 No Content = linked; 400 = folder not found

# every time you change code
npm run bundle:debug
npm run spec -- MyNode           # only needed when the specification changed
#   Stream Designer → Cmd/Ctrl+K → "Import node specification" → paste JSON → Enter
# then run the stream in Stream Designer
```

Re-import the spec only when `specification` changed (names, types, inputs, outputs, connectors). A pure `execute()` change needs only the rebundle.

**Where the output of a run goes**

| What you wrote | Where it shows up |
|---|---|
| `wave.logger.addNodeLog(msg)` | The node's `logs` array in the execution result. Shown in Stream Designer's execution view / debugger for that node. Pushed to helmut.cloud with the periodic status patch (`ExecutionStateHelper`, 250 ms in debug runs). Not written to any file on disk. |
| `wave.logger.updateProgress / updateMessage` | The running node's progress and status line in Stream Designer and the High5 dashboard. Overwritten on each call, not a log. |
| `wave.general.setStreamMessage(msg)` | The stream-level dashboard message. |
| a thrown `Error` | Its message becomes the node's failure message in Stream Designer and the Fail edge fires. |
| `console.log` / `console.error` | The Agent process's stdout, which the packaged Agent redirects into `~/.hcloud/agent/agent.log` (tray menu "Open log folder"). Never visible in Stream Designer. Use `addNodeLog` for anything a workflow engineer should see. |
| an unawaited promise that rejects | Nowhere. The engine registers an empty `unhandledRejection` handler (`wave-engine` `index.js`, verified 3.0.0), so the rejection is swallowed silently. Always `await` or `.catch()` every promise you start. |

**Agent-side logs, for "the catalog didn't load at all"**

- `~/.hcloud/agent/agent.log` — the Agent's own log (module loading, catalog download, engine import errors, stream trigger/finish lines, and anything a node printed with `console.*`).
- `~/.hcloud/agent/crashlogs/crash-<timestamp>.log` — written on `uncaughtException` / `unhandledRejection` in the Agent process, last 20 kept. If the Agent restarted while you were testing, look here first.
- `GET http://localhost:6968/api/agent/v1/logs?level=<level>&entity=<entity>` — live server-sent-events stream of the same log lines, useful with `curl -N` while reproducing a problem.

**There is no execution timeout.** Neither the engine (`StreamRunner`, `NodeExecutor`) nor the Agent caps how long `execute()` may run. Only the workflow engineer canceling the stream ends a hung node. Anything that can hang (a socket that never closes, a promise that never settles) needs its own timeout inside the node, for example `Promise.race` against a timer, in addition to honoring `isCanceled()`.

## Debugging

This section covers breakpoints in your TypeScript through the Node inspector, and Jest as the faster route for pure logic. Before either, rule out wiring: Stream Designer's own stream debugger (a tool for stream builders, not node authors) can pause a run before a node and show the resolved inputs it is about to receive; only top-level streams pause, substreams do not.

### Code debugger (breakpoints in your TypeScript)

The Agent runs the engine and your catalog **in its own process** (`WaveManager.loadDevEngine` does `import()` on the engine, the engine `require()`s your `bundle.js`). So attaching an inspector to the Agent process gives you breakpoints in node code. `scripts/debug.mjs` in the blueprint starts exactly that: it locates the installed Agent bundle under `~/.hcloud/agent/bundle/<version>/index.js`, reads the packaged config, and spawns `node --inspect index.js` with `HCLOUD_PATH` set.

```
1. Quit the running Agent (system tray → Exit). Two Agents cannot share the port.
2. npm run bundle:debug              # source maps, so breakpoints land in .ts, not bundle.js
3. VS Code → Command Palette → "Debug: JavaScript Debug Terminal"
4. In that terminal:  npm run debug   # starts the Agent under --inspect; the terminal auto-attaches
   Wait until the tray icon / log shows the Agent is connected to helmut.cloud.
5. In a second terminal:  npm run link
6. Set breakpoints in lib/nodes/MyNode.ts
7. Run the stream from Stream Designer. Execution pauses at your breakpoint.
8. After each code change:  npm run bundle:debug  and run the stream again. No re-link needed.
```

Notes and pitfalls, all verified against `scripts/debug.mjs` and the Agent source:

- **Order matters**: stop Agent → `npm run debug` → `npm run link`. `link` talks to whichever Agent is listening on 6968; if the normal Agent is still up, it links the wrong process and breakpoints never hit.
- `debug.mjs` supports macOS and Windows only (it throws on Linux). Override the lookup with `HCLOUD_EXEC_PATH` (the installed app) and `HCLOUD_HOME` (defaults to `~/.hcloud/agent`) if it reports `ENOENT` or "config file not in …". The Agent must have been started normally at least once so that `config.local.yaml` exists.
- Without `bundle:debug` the inspector only knows `bundle.js`; breakpoints set in `.ts` files are shown as unbound.
- The inspector pauses the whole Agent process, including its heartbeat to helmut.cloud. Long pauses can make Stream Designer report the Agent as offline; resume and re-run rather than trying to keep a stream alive across a coffee break.
- The stream debugger still works while the inspector is attached; combining a node breakpoint (pause before the node) with a code breakpoint (pause inside it) is the fastest way to localize a problem.
- `wave.general.isDebug()` and `getAgentContext()` exist in the engine's development source but not in the published `wave-engine` 3.0.0 typings. Do not branch node behavior on debug mode; the stream debugger works without the node knowing.

### Unit-level debugging without the Agent

For logic bugs, prefer a Jest test on the extracted helper (see layer 1) and debug that with VS Code's Jest integration; it is faster than the Agent loop and gives the same breakpoints. Use the in-repo `executeChain` framework (layer 2) when the bug is in wiring or wildcard resolution between two nodes.

## Verification checklist for a new node

Run this before considering a node done:

```bash
# 1. Lint passes (custom node-specification rule will warn on missing specVersion or bad additionalConnectors):
npx eslint lib/nodes/MyNode.ts

# 2. Typecheck passes (the base tsconfig.json has no include list and pulls in
#    evals/ and tests/framework/, so always pass -p tsconfig.lib.json — this is
#    what scripts/verify.mjs does too):
npx tsc --noEmit -p tsconfig.lib.json

# 3. Unit tests pass:
npm test

# 4. Spec extracts cleanly (round-trip through esbuild + spec extractor):
npm run spec -- MyNode

# 5. (Manual) Import into Stream Designer and run a smoke test on the happy path and at least one failure path.

# 6. (Manual) Verify the sidecar wavedoc renders correctly (see references/node-documentation.md).
```

## Common debugging patterns

**Input value isn't what you expected** — log the resolved value early in `execute()`:

```typescript
const value = this.wave.inputs.getInputValueByInputName(Input.X);
this.wave.logger.addNodeLog(`X resolved to: ${JSON.stringify(value)}`);
```

(Don't do this for `STRING_PASSWORD` inputs.)

**Output isn't appearing in the next node** — check the binding. In Stream Designer, click the connection, inspect the wildcard. The pattern is `{{OUTPUT.<uuid>.<output-name>}}`. If the output name has spaces (e.g., "Status code"), the binding includes the spaces.

**Node fails with an inscrutable error** — set a breakpoint in the catch branch and inspect the original error. The user-facing message goes through your three-part formatting; the underlying error has the stack trace.

**Spec doesn't import into Stream Designer** — usually a JSON-validity issue or a missing required field. `npm run spec -- MyNode | jq` to validate JSON. Look for missing `description`, `example`, or `specVersion`.

## Anti-patterns

- **Testing `execute()` directly with Jest by mocking `this.wave`.** Tests get coupled to the runtime; refactoring breaks them. Extract pure helpers and test those.
- **Skipping `npm run spec -- MyNode` before claiming the node is done.** This step catches half the silly mistakes — missing examples, invalid types, typos in option keys.
- **`npm run link` before `npm run debug` when debugging.** Breakpoints won't hit. Stop → debug → link.
- **Editing code and re-running the stream without `npm run bundle:debug`.** The Agent re-reads `bundle.js`, it does not rebuild it. The run you just watched used the old code.
- **`console.log` as the debugging channel.** It lands in `~/.hcloud/agent/agent.log`, never in Stream Designer. Use `wave.logger.addNodeLog`, and strip the noisy ones before shipping.
- **A "Progress" output nobody can react to.** `updateProgress` already shows progress in the UI; a `Progress` output only earns its place with a paired `Progress` additional connector (see `additional-connectors.md`).
- **Editing the spec but not re-importing in Stream Designer.** Stream Designer caches its imported specs. Re-import when the spec changes.
- **No smoke test in Stream Designer before shipping.** Unit tests don't tell you the UI renders correctly. A 60-second manual test catches obvious UX regressions.
- **Failure-path tests written as `try/catch` without `expect.assertions(...)`.** They pass silently when the operation doesn't throw — the worst kind of false confidence. Use `.rejects.toThrow(...)` for async or `expect(() => …).toThrow(...)` for sync; reserve `try/catch` for the rare cases where you need to inspect a custom error field, and guard it with `expect.assertions(N)`.

## Curiosity hooks

- The `dev-wave` module on the Agent is what makes hot-reload work — it exposes the endpoint that `npm run link` hits. The folder-watch mechanism lives inside the Agent's Moduler subsystem; node authors interact with it only via the `npm run link` script (no path inside `node_modules/` to cite, since the Agent is a separate process).
- The blueprint's `tests/framework/` is a stripped-down version of the real engine's test harness. It can simulate a stream but not the full Agent context (no secrets, no real platform context). Useful for the 80% case.
- The `npm run spec` script lives in `scripts/spec.mjs` — it bundles the catalog and serializes one node's specification to JSON. Worth reading once to understand what makes it into the output.
