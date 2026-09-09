# Changing an existing node

Use this when: editing, fixing a bug, renaming, migrating a spec version, or adding an input/output to a node that already exists.

Script paths below assume the skill is installed at `.agents/skills/create-high5-nodes/`; adjust the prefix to wherever it actually lives. Run them from the catalog root.

Work the checkpoints in order. Each has five parts: **Gather** (what to open or run), **Decide** (what you settle yourself), **Ask** (what needs the human — "nothing" is a valid value; see `../procedures/ask.md`), **Produce** (files or messages), **Done when** (the observable condition that lets you move on).

## 0. Environment

**Gather:** run `node .agents/skills/create-high5-nodes/scripts/check-env.mjs` (skip if already run this session); read the node's `.ts` and `.md`; check `git tag -l "v*"`; read `changelog.json` for entries beyond the blueprint placeholder; ask whether a registry URL is already known to the human; scan sibling nodes for the pattern this change touches.
**Decide:** the node's current spec version; whether the catalog has ever published (per `../references/changelog-and-versioning.md`'s conditional gate — any `v*` tag, real changelog history, a known registry URL are the signals); whether *this specific node* was bundled in that published release; which other nodes in the catalog share the pattern about to change; the catalog's layout (flat `lib/nodes/<Node>.ts` or per-category subfolders, string categories or an enum under `lib/enums/`, `*Action` suffixes, shared helpers under `lib/helpers/`) so a duplicated `V<n>` node or a new sidecar lands next to its siblings and never in a different convention.
**Ask:** nothing yet — published status gets confirmed in checkpoint 2 only if it's still unclear after gathering.
**Produce:** nothing user-facing.
**Done when:** you know the node's current spec version, the catalog's/node's publish status, and which siblings share the pattern.

## 1. Restate and classify

**Gather:** the requested change, in the human's own words.
**Decide:** restate it in one sentence. Classify it with `../procedures/classify-change.md` — breaking / non-breaking / unpublished-edit-in-place.
**Ask:** nothing here.
**Produce:** the one-sentence restatement plus the classification, with its evidence (published status, which taxonomy rule applies).
**Done when:** you can name the class and point to the evidence for it.

## 1a. Reproduce and diagnose — bug reports only

Skip this checkpoint when the request is a designed change (rename, new input, migration). Run it whenever the request is "it fails", "it hangs", "the output is wrong", or "the node doesn't appear".

**Gather:** the exact symptom in the human's words and, if they have it, the failure message from Stream Designer; the node's `execute()`; then pick the first matching row:

| Symptom | Look at | Reference |
|---|---|---|
| Node missing from the catalog or "is not a constructor" from `npm run spec` | `index.ts` registration; a class that references its own name (`no-class-self-reference`) | `catalog-and-distribution.md`, `house-style.md` |
| Spec will not import into Stream Designer | `npm run spec -- <Node> \| jq`; missing `description` / `example` / `specVersion` | `testing-and-debugging.md` ("Common debugging patterns") |
| Wrong or empty input value | resolved value logged with `addNodeLog`, or the stream debugger paused on the node | `input-coercion.md`, `wildcards-and-variables.md` |
| Output not visible downstream | the wildcard on the connection; output name spelling incl. spaces | `wildcards-and-variables.md` |
| Node fails with an unhelpful message | the original error under the three-part message; a code breakpoint in the catch | `errors.md`, `testing-and-debugging.md` ("Debugging") |
| Node hangs | no engine timeout exists; the awaited call, and `isCanceled()` handling | `cancellation-and-async.md`, `testing-and-debugging.md` |
| Works once, then behaves as if unchanged | `bundle.js` not rebuilt after the edit | `testing-and-debugging.md` ("Dev-mode") |
| Additional connector never fires | `setOutput` before `executeAdditionalConnector`, and the substream actually wired | `additional-connectors.md` |
| Whole catalog fails to load or the Agent restarted | `~/.hcloud/agent/agent.log`, `crashlogs/` | `testing-and-debugging.md` ("Agent-side logs") |
| A log line you added never shows | it was `console.log`, not `addNodeLog` | `wave-runtime.md` ("`wave.logger`") |

**Decide:** reproduce with the cheapest tool that shows the failure — a Jest test on the helper, the `executeChain` framework, the stream debugger, or the code debugger, in that order — and name the cause in one sentence before changing anything.
**Ask:** the human only for what you cannot obtain yourself: a sample input, the Stream Designer failure text, or an Agent log excerpt.
**Produce:** the one-sentence cause with the evidence (file:line, log line, or debugger observation). This becomes the changelog entry's wording later.
**Done when:** the failure reproduces on demand and the cause is stated, not guessed.

## 2. Confirm with the human

**Gather:** the classification and evidence from checkpoint 1.
**Decide:** whether confirmation is actually needed — skip it only when the class is unambiguously non-breaking or unambiguously unpublished-edit-in-place.
**Ask:** confirm when the class is breaking, or when published status is unclear. This is a real decision: state the consequence in plain words — "existing streams keep the old version; new streams get the new one."
**Produce:** the confirmation exchange (or, when confirmation wasn't needed, a one-line statement of the class you're proceeding with).
**Done when:** the class is settled for good.

## 3. Apply the procedure

**Gather:** the confirmed class from checkpoint 2.
**Decide:** which procedure applies —

- breaking, published node → the duplicate-version procedure in `../references/changelog-and-versioning.md` ("Procedure: breaking change to a published node")
- non-breaking, published node → edit in place, same reference ("Procedure: non-breaking change to a published node")
- unpublished (catalog or node) → edit in place, no version bump, no duplication

A spec-version migration (V1/V2 → V3) is a change type like any other, not a special case: migrating an unpublished node is edit-in-place; migrating a published node is breaking only if a field name or type changes as part of the migration. A migration that only adds V3-only metadata (`deprecated`, the in-spec `changelog` array) to an otherwise-unchanged field set is non-breaking.
**Ask:** nothing beyond checkpoint 2's confirmation.
**Produce:** the edited (or duplicated) file(s), per the matching procedure.
**Done when:** the change is implemented under the confirmed procedure.

## 4. Legacy sweep — proposal, not action

**Gather:** the sibling nodes identified in checkpoint 0.
**Decide:** which of them still carry the old pattern this change just fixed — old spec version, Title Case names, missing `Curl`, missing wavedoc.
**Ask:** propose updating them as a separate decision — never edit a sibling without a yes. Give an estimate: how many files, and whether any of them is published (which routes their own update back through this runbook). If the human accepts the proposal for more than two nodes, continue in `rework.md` rather than looping this checkpoint per node.
**Produce:** the proposal, posted once.
**Done when:** the proposal has been made — accepted, declined, or deferred all close this checkpoint.

## 5. Wavedoc alongside the code

**Gather:** the shipped change from checkpoint 3.
**Decide:** nothing — the wavedoc describes what shipped, it doesn't design anything new.
**Ask:** nothing.
**Produce:** run `../procedures/wavedoc.md` for the changed node (and, for a duplicated `V<n>` node, its own new sidecar). A change that alters an input, output, connector, or failure cause without a matching wavedoc update is incomplete.
**Done when:** the wavedoc reflects the shipped change exactly.

## 6. Verify

**Gather:** nothing new.
**Decide:** nothing.
**Ask:** nothing — fix what you can yourself first.
**Produce:** run

```
node .agents/skills/create-high5-nodes/scripts/verify.mjs --node <Name>
```

Fix any failure, re-run.
**Done when:** verify passes cleanly for the changed node.

## 7. Changelog and hand-off

**Gather:** the confirmed class from checkpoint 2.
**Decide:** the changelog entry per `../references/changelog-and-versioning.md`, with the `breaking` flag set correctly for the class.
**Ask:** nothing, unless the bump magnitude (minor vs. patch) for a non-breaking change is genuinely unclear — propose-and-confirm as that reference describes.
**Produce:** the top entry in `changelog.json`; tell the human what's next — commit, or continue to `release.md`.
**Done when:** the changelog entry exists and the human knows the next step.
