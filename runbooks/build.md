# Building a node, several nodes, or a new catalog

Use this when: the request is to build something new — a single node, a handful of nodes, a whole catalog phase, or "wrap this API/CLI/service as a node."

Script paths below assume the skill is installed at `.agents/skills/create-high5-nodes/`; adjust the prefix to wherever it actually lives. Run them from the catalog root.

Work the checkpoints in order. Each has five parts: **Gather** (what to open or run), **Decide** (what you settle yourself), **Ask** (what needs the human — "nothing" is a valid value; see `../procedures/ask.md` for how, including the fallback for a session where no reply can come back), **Produce** (files or messages), **Done when** (the observable condition that lets you move on).

## 0. Environment

**Gather:** run `node .agents/skills/create-high5-nodes/scripts/check-env.mjs`; read `index.ts`, `lib/nodes/`, `changelog.json`, `package.json`.
**Decide:** whether the catalog is fresh (only the sample `HttpClient` node) or already has nodes you should stay consistent with — naming, categories, helper layout. Read the layout off `lib/nodes/` and `index.ts` before scaffolding: flat files (`lib/nodes/<Node>.ts`, the blueprint default) or per-category subfolders (`lib/nodes/<category>/<Node>.ts`); string category literals or a category enum under `lib/enums/`; a `*Action` class suffix; shared client code under `lib/helpers/`. Match what is there — pass the subfolder as the third argument to `scripts/new-node.sh` when the catalog uses subfolders, reference the enum when it has one — and never introduce a second convention into an established catalog.
**Ask:** nothing.
**Produce:** nothing user-facing yet — this is situational awareness for every checkpoint after it.
**Done when:** you know the installed `wave-engine` / `hcloud-sdk` versions and whether the catalog is fresh or established.

## 1. Intent and size

**Gather:** the user's request, plus anything already said this session.
**Decide:** restate the request in one sentence; classify size (single node / a few nodes / a whole catalog phase); classify the archetype(s):

| Archetype | Hallmark |
|---|---|
| Transform | Pure input → output, no external call |
| HTTP read | GET-shaped: fetch/list/search |
| HTTP write | POST/PUT/PATCH/DELETE-shaped |
| List/search | Returns a collection; needs a visible filter, not raw pagination |
| Iteration with additional connector | Emits per-item or per-progress-milestone during the run |
| File/folder | Touches the filesystem; may collide (needs a conflict-rule input) |
| Shell/CLI wrapper | Spawns a process |
| hcloud-sdk | Touches helmut.cloud itself (org, space, files, users) |

**Ask:** for an under-specified request, the scoping question is the first and only question of round one — see `../procedures/ask.md` ("Scoping before plumbing"): "add a Slack node" gets asked which Slack action and which auth model, not which engine version. A concrete request ("add a SHA-256 hashing node") needs no scoping question — classify it and move on.
**Produce:** the one-sentence restatement and archetype classification. It goes into the contract review block (checkpoint 3); it is not a separate approval round. Post it on its own only when a scoping question was needed and the answer changes what gets built.
**Done when:** you can say in one sentence what will exist at the end and which archetype(s) it is.

## 2. Catalog identity

Fires only when the catalog is new: `index.ts` is missing, empty, or still has the blueprint placeholder `"example name"` / `"example description"`, and the domain/product is now named.

**Gather:** `index.ts`'s current state; the installed engine version from checkpoint 0.
**Decide:** name (short) and description (action verbs the user would say + entity nouns, no marketing adjectives, no infra jargon, no "for helmut.cloud" — full rules in `../references/catalog-and-distribution.md`); `minimumEngineVersion` = the installed version from `check-env` unless the human says otherwise, and never a `-dev` tag; leave `logoUrl` a placeholder until publishing comes up (`../runbooks/release.md`).
**Ask:** propose name + description, wait for accept or edit. The engine version is **never a question here** — state it as a confirmation line ("Targeting wave-engine `<version>` — that's what's installed; say if you want a different one") since `check-env` already answered it. If the human does want a different (production, non-`-dev`) version, or the space this catalog will run in can't yet support the installed one, follow `../references/catalog-and-distribution.md` ("Picking the wave-engine target version") to install and confirm the target.
**Produce:** the confirmed name, description, and engine version, carried into the contract review block.
**Done when:** name, description, and engine version are settled (confirmed, or — no reply possible — recorded as assumptions).

## 3. Node contract

**Gather:** the API doc, CLI help, or existing node this node is modeled on.
**Decide:** nothing here directly — run `../procedures/node-contract.md` for each node in scope, in order.
**Ask:** whatever `node-contract.md` and `ask.md` surface, in rounds of at most three.
**Produce:** `../templates/contract-review.md` filled in per node, posted as a single block (one block covering all nodes in this build).
**Done when:** the human approves the block — or, when no reply is possible, every open decision has been resolved to its recommended default and recorded as an assumption in the block. This is the single approval gate: no node file exists before this checkpoint closes.

## 4. Scaffold

**Gather:** the confirmed class names and categories from the approved contract.
**Decide:** nothing new — identity was already settled.
**Ask:** nothing.
**Produce:** for each node, run:

```
bash .agents/skills/create-high5-nodes/scripts/new-node.sh "ClassName" "Category Name"
```

Building several nodes means several separate invocations — one `new-node.sh` call per node, never a loop over an unquoted `"ClassName Category"` string, which word-splits and writes a file literally named `lib/nodes/ListTeams Teams.ts`. If a loop is genuinely useful, split each spec into positional args first:

```
for spec in "ListTeams Teams" "CreateTask Tasks"; do
    set -- $spec
    bash .agents/skills/create-high5-nodes/scripts/new-node.sh "$1" "$2"
done
```

`new-node.sh` refuses a `ClassName` containing whitespace, so a mistake here fails loudly instead of writing a bad file.

It writes `lib/nodes/ClassName.ts`, `lib/nodes/ClassName.md` (wavedoc sidecar), and `tests/nodes/ClassName.test.ts`, and refuses to overwrite existing files. Register each class in `index.ts` immediately (import + add to the `Catalog(...)` varargs). Note the two follow-ups it prints — `index.ts` registration and a `changelog.json` entry — so checkpoint 8 doesn't skip them. The scaffold is a starting shape, not content: every placeholder it writes (the `TODO: input name` / `TODO: output name` enum values, the `TODO:` descriptions, the sample `execute()` body) is replaced in checkpoint 5, and nothing from the template survives — not as dead code, not as a comment "kept for reference". `verify.mjs` fails on any leftover placeholder.

If checkpoint 0 found the catalog was still on the blueprint placeholder, removing it is a single step with three parts, not one: the sample node (`lib/nodes/HttpClient.ts`), its wavedoc (`lib/nodes/HttpClient.md`), **and** its test (`tests/nodes/HttpClient.test.ts`) all go together. Leaving the test behind while deleting the node fails jest with a module-not-found error — `verify.mjs`'s `orphan-tests` check also catches it, but delete all three now rather than round-tripping through a failed verify. Propose the removal alongside the real nodes and record it as a stated assumption in the contract block; never delete anything the user wrote.
**Done when:** every approved node has its three scaffold files and appears in `index.ts`, no blueprint placeholder remains where a real node has replaced it, and if the sample node was removed, its `.ts`, `.md`, and `.test.ts` are all gone together.

## 5. Implement

**Gather:** the approved contract; the matching archetype example (see table below); the installed helper surface (`node_modules/wave-engine/helpers/Wave.d.ts`, or `node .agents/skills/create-high5-nodes/scripts/engine-surface.mjs`).
**Decide:** nothing new — implement to what the contract already settled.
**Ask:** nothing, unless a real conflict with an engine rule surfaces mid-implementation (see `../procedures/ask.md`, "After the contract is approved, stop asking").
**Produce:** a working `execute()`, with pure helpers (parsers, validators, transformers) extracted and tested where the node is non-trivial — TDD cadence in `../references/workflow.md`. Files are written formatted, not as a later cleanup step: run `npx prettier --write lib/nodes` before verify, not after a `format` failure reports it.
**Done when:** the node compiles and its own tests, if any, pass.

The seven most load-bearing rules here — everything else in `../references/house-style.md` still applies, but these break things visibly if missed:

- `throw-to-fail` — throw to fail, never invent an error output
- `three-part-error-message` — what failed — why — what to check
- `no-shell-string-injection` — never a wildcard-resolved input into a shell string; array-form spawn only
- `no-log-string-password` — never log a `STRING_PASSWORD` value
- `output-type-priority` — `STRING_LIST` / `STRING_MAP` / `STRING_LONG` before `JSON`
- `curl-on-http-nodes` — nodes that send their own request via `wave.axiosHelper` ship a redacted `Curl` output built with `convertRequestToCurl`; SDK-client nodes (hcloud-sdk, AWS SDK) ship none
- `no-class-self-reference` — never reference the class's own name inside its body (a static helper called as `ClassName.helper()`, an `instanceof ClassName` check); use module-level functions or `this.method()` instead. esbuild renames self-referencing classes, and the catalog's lookup by constructor name breaks.

**Archetype → example** (`../references/examples/` — one compiled, lint-clean example per archetype, each with a wavedoc sidecar and, where a pure helper exists, a unit test):

| Archetype | Example file | Also shows |
|---|---|---|
| Transform | `HashString.ts` | module-level pure helper extraction, unit-tested (`HashString.test.ts`) — no external call, no cancellation needed |
| HTTP read | `GetTicket.ts` | the credential input pattern (`Api key` + `<Product> url`), curated outputs before the raw entity, redacted `Curl` last |
| HTTP write | `CreateTicket.ts` | mandatory-vs-advanced triage, a STRING_LONG structured field parsed and validated at the `execute()` boundary, write-shaped error handling (400/401/409) |
| List/search | `ListTickets.ts` | a visible filter plus an advanced `Max results` cap instead of raw pagination, `STRING_LIST` id output, an id-extraction helper unit-tested (`ListTickets.test.ts`) |
| Iteration with additional connector | `IterateFolder.ts` | the paired-output-before-fire ordering rule, always-`await`ed connector calls, cooperative cancellation between iterations |
| File/folder | `DownloadFile.ts` | `file-conflict-handling` (`DuplicateFileOption`), the cancellation + progress + `onCleanup` idiom for a long-running operation (`../references/cancellation-and-async.md`) |
| Shell/CLI wrapper | `GetKubernetesPod.ts` | the full shell-hardening checklist (allow-list, leading-dash rejection, absolute binary path, explicit env/cwd/timeout/maxBuffer, `onCleanup` SIGKILL), allow-list helpers unit-tested (`GetKubernetesPod.test.ts`) |
| hcloud-sdk | `GetSpaceSecret.ts` | the one legitimate secret-store call in a catalog (every other node takes credentials as a `STRING_PASSWORD` input instead) — see `../references/secrets-and-auth.md` |

Composing several API calls into one user-meaningful action (`action-not-endpoint`) has no dedicated example in this gallery — see `../references/action-not-endpoint.md`.

**Wildcard and helper-surface caveat:** don't hardcode a `{{wildcard}}` name or a `this.wave.*` helper from memory — both vary by engine version. Verify against the installed `node_modules/wave-engine/` (or `engine-surface.mjs`'s output), not this skill's recollection.

## 6. Document

**Gather:** the approved contract and the node's actual implementation (note anything that drifted from the contract during implementation).
**Decide:** nothing — the wavedoc describes what shipped, it doesn't design anything new.
**Ask:** nothing.
**Produce:** fill `lib/nodes/ClassName.md` per `../references/node-documentation.md` — one entry per input and output, one `causes:` entry per distinct error class the node throws.
**Done when:** the wavedoc fully covers the shipped inputs, outputs, and failure causes. This step is never skipped, and it is never "MVP."

## 7. Verify

**Gather:** nothing new.
**Decide:** nothing.
**Ask:** nothing — fix what you can yourself first.
**Produce:** run

```
node .agents/skills/create-high5-nodes/scripts/verify.mjs
```

Fix any failure, re-run.
**Done when:** verify passes cleanly. Never report the build done while a check fails; show the human the final verify summary either way.

## 8. Hand-off

**Gather:** whether this catalog (or this specific node) has ever shipped in a published release — per `../references/changelog-and-versioning.md`'s conditional gate.
**Decide:** the changelog entry needed: a fresh catalog or a never-shipped node just needs an addition entry; a previously-published node being touched needs the breaking/non-breaking classification from that same reference.
**Ask:** nothing, unless the shipped-or-not determination is genuinely unclear (ask exactly as `changelog-and-versioning.md` describes).
**Produce:** add an entry to the top of `changelog.json`; tell the human what's next — commit, or continue to `release.md`. No publishing happens in this checkpoint.
**Done when:** the changelog entry exists and the human knows the next step. This changelog edit happens after checkpoint 7's verify run, so it is not yet covered by it — the verify run that gates the final message must be the last command before that message, no matter which checkpoint it falls in: re-run `verify.mjs` with no `--only` after this edit (and after any other cleanup you do before sending the final message), rather than relying on checkpoint 7's now-stale run.
