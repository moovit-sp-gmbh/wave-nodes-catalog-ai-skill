---
name: create-high5-nodes
description: Design, build, review, debug, document, version, and publish helmut.cloud wave nodes and catalogs. Use when the user asks to create or change nodes, wrap an API/CLI/service as Stream Designer actions, design node inputs/outputs/connectors, update wavedocs, migrate node specs, fix node runtime or loading issues, manage catalog registration/changelog/versioning/publishing, or work with wave-engine, wave-nodes, high5, StreamNodeSpecification, Catalog, npm run spec/link, lib/nodes/*.ts, or lib/nodes/*.md.
---

# create-high5-nodes

## What this skill does and for whom

You help build, change, review, and release nodes and catalogs for the **helmut.cloud** platform. A node is a TypeScript class extending `Node` with a declarative `specification` and an async `execute()`; nodes run inside the **wave-engine** runtime, load through the helmut.cloud Agent, and render in **Stream Designer** as draggable building blocks. A catalog bundles and ships a set of nodes.

This skill encodes MoovIT Software Products' house style — prescriptive defaults for new work, on by default, overridable per rule at any point via `create-high5-nodes.config.json` at the catalog root (rule table: `references/house-style.md`).

## Start every session the same way

Run this from the catalog root, adjusting the prefix to wherever this skill is installed:

```
node .agents/skills/create-high5-nodes/scripts/check-env.mjs
```

It prints the installed `wave-engine` and `hcloud-sdk` versions and hard-fails if a blueprint file is missing. This skill's facts are verified against `wave-engine 2.0.1 / hcloud-sdk 16.0.0`; if the installed versions differ, tell the user and treat any fact tagged `(engine, verified 2.0.1)` as needing re-verification against the installed source, not this skill's memory. If Node itself can't run the script, open `package.json` and `node_modules/wave-engine/package.json` directly instead.

## Route the request

| Request shape | Go to |
|---|---|
| Build — a new node, several nodes, a new catalog, "wrap this API/CLI/service" | `runbooks/build.md` |
| Change — edit, fix a bug, rename, migrate a spec version, add an input/output to an existing node | `runbooks/change.md` |
| Rework — bring an existing catalog or several nodes up to house style, apply a review report, batch rename/retype across nodes | `runbooks/rework.md` |
| Debug — a node fails, hangs, produces the wrong output, or never shows up in Stream Designer | `runbooks/change.md` checkpoint 1a, then `references/testing-and-debugging.md` ("Debugging") |
| Review — "is this node right", an audit, a PR review | `runbooks/review.md` |
| Release — version, changelog, tag, publish, import into Stream Designer | `runbooks/release.md` |
| Platform question with no code change (engine behavior, helper surface, wildcards…) | the matching reference — see Map below |
| Out of scope — the helmut.cloud Agent itself, wave-engine, hcloud-sdk, the Stream Designer frontend, or non-node TypeScript/Node.js work | say so and stop |

## How to work with the human

Full rules in `procedures/ask.md`; the short version: ask in rounds of at most three questions, each with a recommended answer and a one-line reason, in plain language — never engine internals or type names to a reader who isn't a developer. When a request is under-specified, the scoping question (what to build) comes before any procedural question (engine version, catalog name) — the engine version itself is never a blocking question, since `scripts/check-env.mjs` already answers it. "You decide" means: use the recommendation and write it into the contract as a stated assumption. When no answer can come back at all (a one-shot run, or "don't ask, just build"), do the same for every question by default — record every assumption in the contract block, and repeat the whole contract review block (inputs, outputs, connectors, assumptions) in the final message, because in a one-shot run the final message is the only thing the human reads — and stop only if the request is too vague to draft a contract from at all. The contract review block (`templates/contract-review.md`) is the single approval gate before any file is written when a reply is possible. After that, keep working until verify passes — come back to the human only for a real decision, not a status update.

The final message is read by the same non-developer as the wavedoc: lead with what was built in Stream Designer terms, keep file paths and words like "registered in index.ts", "spec", or "typecheck" out of the first paragraph, state the recorded assumptions, and end with one concrete next step — "open Stream Designer, drag in the new `<Node name>` node, set `<input>`."

## Rules that never bend

These come from the wave-engine and hcloud-sdk; no override exists for them.

- `boolean-default-required` — every BOOLEAN input declares a literal `defaultValue`
- `example-required` — every input and output declares a realistic `example`
- `input-output-description-required` — every input and output declares a `description`
- `spec-version-v3` — new nodes declare `specVersion: 3`
- `enum-io-names` — input/output field names come from a local `enum Input` / `enum Output`
- `credentials-string-password` — credential inputs are always `STRING_PASSWORD`
- `no-log-string-password` — never log a `STRING_PASSWORD` value
- `no-secret-store-in-execute` — never call the secret store from inside `execute()`
- `throw-to-fail` — throw to fail; never invent an error-output field
- `no-shell-string-injection` — never pass a wildcard-resolved input into a shell string
- `additional-connectors-mid-execution-only` — additional connectors fire only while the node is still running, never for a terminal outcome

Everything else is house style: prescriptive, and listed with rationale in `references/house-style.md`. The user can turn any house-style rule off in `create-high5-nodes.config.json` at the catalog root.

## Done means

`scripts/verify.mjs` passes — typecheck, this skill's lint, style-rule conformance, formatting, tests, orphan-test detection, wavedoc-sibling checks, `index.ts` registration, and the changelog check. Run:

```
node .agents/skills/create-high5-nodes/scripts/verify.mjs
```

Don't report a build done while any check fails. Show the user the final verify summary. The verify run that gates the final message must be the last command you run before sending it — any edit afterward, including cleanup or a late changelog entry, means a full re-run of `verify.mjs` with no `--only`, since a scoped or now-stale run no longer speaks for the whole catalog.

## Map of this skill

- `runbooks/` — one file per phase: `build.md`, `change.md`, `review.md`, `rework.md`, `release.md`
- `procedures/` — `ask.md` (how to ask the human), `node-contract.md` (how to derive and confirm a node's contract), `classify-change.md` (breaking / non-breaking / unpublished-edit-in-place), `wavedoc.md` (deriving and updating a node's wavedoc sidecar)
- `templates/` — `contract-review.md` (the approval block), `first-message.md` (greeting behavior)
- `references/`, grouped by topic:
  - Naming & house style: `naming-and-style.md`, `action-not-endpoint.md`, `house-style.md`, `house-style-vs-user-style.md`
  - Spec & types: `specification.md`, `input-type-rules.md`, `input-coercion.md`, `parked-v4-dependent-inputs.md`
  - Runtime behavior: `wave-runtime.md`, `cancellation-and-async.md`, `additional-connectors.md`, `wildcards-and-variables.md`
  - Security: `secrets-and-auth.md`, `shell-injection-and-process-execution.md`
  - Integrations: `hcloud-sdk-usage.md`, `source-protocols.md`, `dependencies.md`, `typescript-best-practices.md`
  - Docs, errors, sourcing: `node-documentation.md`, `errors.md`, `docs-grounding.md`
  - Test & debug: `testing-and-debugging.md`
  - Catalog lifecycle: `catalog-and-distribution.md`, `changelog-and-versioning.md`, `workflow.md`
  - `examples/` — one compiled example per archetype, mapped from `runbooks/build.md`, each with a wavedoc and, where useful, a test
- `scripts/` — `check-env.mjs`, `verify.mjs`, `style.mjs`, `engine-surface.mjs`, `new-node.sh` (see `scripts/README.md`)
- `style/rules.json` — the rule source of truth `references/house-style.md` is generated from
- `lint/` — this skill's ESLint config enforcing the lint-backed rules above

Character limits and other fine-grained engine facts live in the references above, not here — see `references/naming-and-style.md` ("Character limits") before emitting any user-visible field.
