# Source protocols — OpenAPI, CLI, SOAP, WebSocket, stdlib, npm

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

When the user says "wrap this API as a node" / "build a catalog around our CLI" / "we have a SOAP service" / "I want to use this npm package as a node". This file is a playbook per source type. In every case the goals are the same: **reason action-shaped**, **ground from authoritative sources**, **minimize dependencies**.

## OpenAPI

The user hands you a Swagger/OpenAPI doc. Tempting move: one node per operation. Resist.

**Process:**

1. **Read the OpenAPI doc.** Fetch it or open the local file. Catalog the operations, their parameters, their responses.
2. **Identify the user-meaningful actions.** Five `GET /customers/...` endpoints might be one *List Customers* node; *Create Order* might span `POST /orders` + `POST /orders/:id/items` + `POST /orders/:id/submit`.
3. **Apply the action-not-endpoint test** from `action-not-endpoint.md` for every cluster.
4. **Standardize the auth surface.** Look at the OpenAPI `securitySchemes` — there's almost always one. Lift it into a consistent input across all nodes: `<Product> url` + `Api key` / `Bearer token` (sentence case per the casing rule).
5. **Standardize the error surface.** Many APIs use the same error shape (`{ code, message, detail }`). Translate that to your three-part error message (`errors.md`) once in a domain helper and reuse.
6. **Extract a domain helper class** under `lib/helpers/<product>-client.ts` that wraps the HTTP details. Each node imports the helper, calls one or two methods, and shapes outputs. Don't duplicate axios config across every node.

**Common OpenAPI patterns and what they map to:**

| OpenAPI | Node spec |
|---|---|
| `parameters: path` | A mandatory input. |
| `parameters: query` (required) | A mandatory input. |
| `parameters: query` (optional) | An `advanced: true` input with a defaultValue when it is a real tuning knob; a visible optional input when it is the primary way users search/filter. |
| Pagination query fields (`page`, `cursor`, `offset`, `per_page`, `limit`) | Usually internal defaults, not inputs. Expose only with an iteration/page-emission design, a `Max results` abstraction, or an explicit user request for manual page/cursor control. |
| `requestBody` (single resource) | One `STRING_LONG` input (the engineer authors the JSON by hand — parse and validate at the `execute()` boundary) or `ANY` (wired from an upstream structured output — see `wave-runtime.md`), or split into individual inputs if the body is shallow. |
| `responses: 200 schema` | The output(s). For a single resource, expose entity-id + entity-details + curl. For a list, expose entities + total-count + curl. (The engine emits `node.<uuid>.info.runTime` automatically — never declare a `Run time` output.) |
| `responses: 404` | Throw to Fail with a three-part message: `Could not retrieve <entity> — <service> returned 404 — verify the <id> exists`. Never an additional connector — it's a terminal outcome. |
| `responses: 429` | Throw to Fail: `Could not complete request — <service> returned 429 (rate limited) — add delay between calls or upgrade your plan`. |
| Specific 4xx semantics | Throw to Fail with a three-part message tailored to the cause. |
| Streaming responses (chunked transfer, SSE, etc.) | Fire an additional `Chunk` connector per chunk with a paired `Current chunk` output — see `additional-connectors.md` for the iteration/streaming pattern. |
| OAuth `securityScheme` | Two `STRING_PASSWORD` inputs (access + refresh tokens). See `secrets-and-auth.md`. |

## Nested SaaS resources — propose a discovery chain `[Important]`

Many SaaS APIs organize resources as nested trees: a leaf resource lives inside one or more parent containers. Acting on the leaf (creating a task, sending a message, opening an issue) requires the user to first locate the right container hierarchy.

| SaaS | Hierarchy |
|---|---|
| ClickUp | team → space → folder → list → task |
| Slack | workspace → channel → message |
| Linear | team → project → issue |
| Jira | site → project → issue |
| GitHub | org → repo → issue / PR |
| Asana | workspace → project → task |
| HubSpot | portal → object type → record |
| Notion | workspace → database → page |

The pattern repeats: workflow engineers don't know the parent IDs at design time, so the catalog needs **discovery nodes** that let them browse the tree and capture IDs into stream variables, *before* the action nodes that consume those IDs.

**Pattern — one list node per parent layer, plus action nodes for the leaf:**

```
[List teams] → [List spaces] → [List folders] → [List lists] → [Create task]
                                                                    ↓
                                                            [Update task]
```

Each list node takes the parent ID from the layer above and returns a `<Children>` array + `Total count` (the List archetype from `naming-and-style.md`). The action nodes consume the leaf-container ID plus the task-specific inputs.

**Rules:**

1. **One list node per parent type in the hierarchy.** Don't skip layers — a catalog that goes "List teams → Create task" leaves the user stuck if the API requires the leaf container ID. Even if the leaf list is rarely useful in isolation, expose it for completeness.
2. **Optional layers get their own node, not a flag on the parent's list.** ClickUp's folder layer is optional (a space can hold folderless lists), but the right answer is *List folderless lists* as a sibling to *List folders*, not a `STRING_SELECT` "include folderless?" on List folders. Each list node returns one cohesive collection.
3. **Discovery list nodes take parent IDs as `STRING` inputs**, not parent objects. Workflow engineers wire IDs via wildcards from the upstream list's `<Children>` array (`{{node.list-spaces.output.Spaces.[0].id}}`). Don't try to pass whole objects between nodes.
4. **Action nodes that operate on the leaf take only the leaf container ID** (and the leaf-specific inputs). Don't replicate the entire hierarchy as inputs on the action — that defeats the discovery chain.
5. **Document the chain in the catalog description and in the first action node's wavedoc**. The user reading *Create task* shouldn't have to guess that they need to chain four list nodes upstream.
6. **Surface the discovery chain in the pre-scaffold review** (Step 3.5). The output schemas of the list nodes and the inputs of the action nodes have to fit together — review them as a single graph, not as independent rows.

**Edge case — when the hierarchy has alternate branches.** Some APIs let leaves live under multiple parent types (ClickUp lists can live under a folder *or* directly under a space). Expose both branches explicitly: one list node per branch. **MUST NOT** combine them under a single node with a "which parent type?" `STRING_SELECT` — that conflates two semantically different lookups, and the wavedoc explanation becomes unreadable.

**Anti-pattern — skipping discovery and demanding raw IDs.** A catalog that ships only *Create task* (with a mandatory `List id` input) and no list nodes forces every workflow engineer to find list IDs out-of-band (browser URL inspection, API console, etc.). The discovery chain is part of the catalog's value, not optional polish.

## CLI

The user wants nodes that wrap a CLI tool (`docker`, `git`, `kubectl`, `terraform`, a custom internal tool).

**Process:**

1. **Read the CLI's help output and docs.** Fetch the docs page if there is one; otherwise `<tool> --help` and `<tool> <subcommand> --help`. Capture every flag.
2. **Map subcommands to actions, not flags to inputs.** `docker run` is *Run Container*. Don't expose 35 of `docker run`'s flags as 35 inputs — pick the 4–6 that matter and put the rest under `advanced: true` (or skip).
3. **Use `child_process.spawn`, not `exec`.** `spawn` streams stdout/stderr, doesn't buffer to memory, handles signals cleanly. `exec` is a footgun for anything non-trivial.
4. **Pipe stdout/stderr to the logger** as the CLI emits them, so the user can watch progress in real time:
   ```typescript
   const proc = spawn(cliPath, args, { signal: controller.signal });
   proc.stdout.on("data", (chunk) => this.wave.logger.addNodeLog(chunk.toString().trim()));
   proc.stderr.on("data", (chunk) => this.wave.logger.addNodeLog(chunk.toString().trim()));
   const exitCode: number = await new Promise((resolve, reject) => {
       proc.on("close", resolve);
       proc.on("error", reject);
   });
   ```
5. **Handle exit codes.** Non-zero → fail with a three-part message ("Command failed — exit code N — check the logs"). Capture stdout/stderr as outputs.
6. **Watch for path issues.** `docker` lives in different places on Windows vs. Unix. Expose a `Path to <CLI>` input (mandatory or advanced with a sensible default).
7. **Watch for shell quoting.** `spawn(cmd, args)` doesn't invoke a shell — arguments are passed as an array. If the user types `--foo "a b"`, you can't just split on space. Parse if you must, or accept arguments as `STRING_LIST` (one flag per entry).
8. **Cancellation maps to `controller.abort()`.** The `signal: controller.signal` option on `spawn` cleanly kills the child process on cancel.

## SOAP

Older, hairier protocol. Three options:

- **Hand-write the envelope.** For one or two operations, build the SOAP XML string and POST it with `wave.axiosHelper.makeRequest`. Parse the response with a tested XML library (`fast-xml-parser`).
- **Generate from WSDL.** If the WSDL has many operations, use a generator (`soap` or similar) to produce typed bindings. Worth the dep if there are 20+ operations to wrap.
- **Use a vendor SDK.** If the SOAP service has a maintained Node.js SDK, use it.

In all cases, hide the SOAP details inside a domain helper. Nodes shouldn't see envelopes.

## WebSocket / streaming protocols

Wave nodes are **not designed for long-lived bidirectional connections**. `execute()` is a one-shot async operation. If you need a WebSocket:

- **Short-lived (open → send → recv → close → return):** fine. Wrap with `ws` or use `globalThis.WebSocket` if Node version supports it. Treat like an HTTP call.
- **Long-lived (subscribe to a stream of events, react over time):** doesn't fit the node model. The right answer is usually a separate process or a different architecture; flag this to the user.

## Node.js standard library

For nodes that don't talk to anything external — pure transformations, format conversions, crypto operations, file handling — the stdlib is almost always enough. Combine with `wave.fileAndFolderHelper` for file I/O. See `dependencies.md` for the "stdlib is enough" cases.

Examples:

- **Compute SHA-256 of a string** → `node:crypto.createHash("sha256").update(input).digest("hex")`. No dep.
- **Generate a UUID** → `node:crypto.randomUUID()`. No dep.
- **Parse a URL** → `new URL(value)`. No dep.
- **Compress/decompress** → `node:zlib`. No dep.
- **Read a JSON file** → `wave.fileAndFolderHelper.readFile` + `JSON.parse`. (Or just `node:fs/promises.readFile` if you need streaming.)

## npm packages — when justified

See `dependencies.md` for the full four-question test. Short version: yes for cryptography primitives, well-tested spec parsers, vendor SDKs, schema validators, and stream/binary format handlers. No for utility belts and one-liners you could write yourself.

## Anti-patterns

- **One node per OpenAPI operation, no thought given.** Almost always wrong. Cluster into actions.
- **Mirroring 30 CLI flags as 30 inputs.** Pick the 4 that matter; advanced the rest; skip the obscure.
- **Using `exec` for non-trivial CLI work.** Stick with `spawn`.
- **Hand-rolling SOAP envelopes with naive string concatenation.** XML escaping bites. Either fully parse/serialize or use a library.
- **Designing a node around a long-lived WebSocket.** Doesn't fit. Talk to the user about a different architecture.
- **Reimplementing standard primitives that the stdlib already does.** Especially crypto — don't write your own.

## Curiosity hooks

- The "action, not endpoint" principle in `action-not-endpoint.md` is most acute for OpenAPI ingestion — the tempting endpoint-per-call shape produces the worst catalogs. Spending time clustering operations into actions is the highest-leverage move when wrapping an API.
- CLI nodes that proxy `--help` to the user (e.g., a *Get Docker Help* node when wrapping `docker`, a *Get Git Help* node when wrapping `git`) are sometimes worth including — they let users discover the wrapped tool's full surface without leaving Stream Designer. Not a high priority but a friendly touch.
- For ambitious OpenAPI ingestion, see if you can extract a *type-only* dependency on the OpenAPI doc to generate request/response types at build time. The end result is a catalog where each node has typed I/O all the way through.
