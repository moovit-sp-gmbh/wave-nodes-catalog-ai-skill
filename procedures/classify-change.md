# Classifying a change to an existing node

Use this when: any edit to a node that already exists — before touching the file, settle which of three classes the change falls into. Full taxonomy, procedures, and worked patterns live in `../references/changelog-and-versioning.md` — this procedure is the decision path to get to a class and the wording to use once you're there; it cites that reference rather than restating it.

## The three classes

- **Breaking** — the node was bundled in a published catalog release, and the change would break a deployed stream. Requires the duplicate-version procedure (new `V<n>` class and files); the old node stays untouched.
- **Non-breaking** — the node was bundled in a published release, but the change is additive or safe (new advanced input with a default, new output, internal refactor with byte-identical outputs). Edit in place; bump `specification.version` minor or patch.
- **Unpublished-edit-in-place** — the catalog has never published, or this node was never in a published release. No users to protect. Edit in place; no version bump on the node at all.

## Is the node published?

Check, in order: (a) any `git tag -l "v*"` on the repo — no tags means the catalog has never published; (b) was this node's file present at the most recent tag (`git show <tag>:lib/nodes/<Name>.ts`); (c) does `changelog.json` have real entries beyond the blueprint placeholder that predate this change. If all three are ambiguous or contradictory, ask the human directly — don't guess. A dev-release tag (`v1.2.0-dev-5`) doesn't change this: if customers actually consumed it, treat the node as published.

## Change → class

| Change | Class | Why |
|---|---|---|
| Rename an input or output | Breaking (if published) | Streams reference the old name — taxonomy rules #2, #9 |
| Change an input or output's type | Breaking (if published) | Downstream type/coercion assumptions shift — rules #3, #10 |
| Remove an input or output | Breaking (if published) | Streams wired to it lose their wiring — rules #1, #8 |
| Change `mandatory: false` → `true` (any input, however it was hidden) | Breaking (if published) | Every stream that omitted it now fails validation — rule #5 |
| Change what a default value means, or the default itself, for an existing field | Breaking (if published) | Observable behavior differs for the same inputs — rule #14 |
| Change the connector set — add | Non-breaking | A new connector doesn't affect existing wiring |
| Change the connector set — remove or rename | Breaking (if published) | Streams wired to that edge break — rule #11 |
| Change error behavior on the same input (now throws where it didn't, or the reverse) | Breaking (if published) | Success/Fail branches downstream stop firing as before — rules #12, #13 |
| Add a new optional (advanced) input with a default reproducing prior behavior | Non-breaking | Explicitly listed safe in the reference |
| Add a new output | Non-breaking | Explicitly listed safe |
| Description/example text only | Non-breaking | Spec `name`/`description`/`category`/`example` changes are explicitly safe |
| Wavedoc-only change (no `.ts` change) | Non-breaking if published (patch, "documentation-only fixes"); no version bump if unpublished | Doesn't touch the node's observable surface |
| Internal refactor | Non-breaking (patch) only if byte-identical outputs; otherwise breaking | Rule #14 applies to any observable difference, including bug fixes |
| Dependency bump | Non-breaking (patch) only if behavior doesn't change; otherwise breaking | Same rule #14 test |
| Spec-version migration (V1/V2 → V3) | Unpublished node → edit-in-place. Published node → breaking only if a field name or type changes as part of the migration; otherwise non-breaking | Migrating the spec version alone isn't observable to a stream — see `../runbooks/change.md` checkpoint 3 |

When in doubt between two rows, treat as breaking — per the reference's own rule: "creating a new major version is cheap; breaking a deployed stream is not."

## Wording for the human

State the consequence before the mechanism. Lead with what changes for a stream owner, not with spec internals:

> "This change is breaking — it would `<plain-English impact, e.g. "stop existing streams from reading the old field">`. I'll create a new version of this node alongside the existing one; the old version keeps working untouched. Does that work?"

For an unclear published status: "I can't tell from the repo whether this node has ever shipped to a real space — has it, as far as you know?"

## What to record in the changelog entry, per class

- **Breaking:** top `changelog.json` entry with `breaking: true`, naming the new major version and what it replaces (e.g. "Add `CreateTicketV2` with structured `Ticket` output (replaces v1's `TicketId` string)").
- **Non-breaking, published:** entry with `breaking: false`, phrased for the workflow engineer, not the implementation ("Add `Timeout` advanced input to HTTP Client", never "refactored axios config").
- **Unpublished-edit-in-place:** still gets a `changelog.json` entry on the next release (the catalog-wide changelog is independent of the per-node gate), `breaking: false`, phrased as a plain addition/fix — but no per-node `specification.version` bump.
