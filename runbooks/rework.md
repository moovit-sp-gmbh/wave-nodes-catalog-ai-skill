# Reworking an existing catalog

Use this when: the request is "bring this catalog up to house style", "rework these N nodes", "apply this review report", or any batch sweep across multiple existing nodes — not a single node's edit (`change.md`) and not an audit that stops at reporting (`review.md`).

Script paths below assume the skill is installed at `.agents/skills/create-high5-nodes/`; adjust the prefix to wherever it actually lives. Run them from the catalog root.

Work the checkpoints in order. Each has five parts: **Gather** (what to open or run), **Decide** (what you settle yourself), **Ask** (what needs the human — "nothing" is a valid value; see `../procedures/ask.md`), **Produce** (files or messages), **Done when** (the observable condition that lets you move on).

## 0. Environment and shape

**Gather:** run `node .agents/skills/create-high5-nodes/scripts/check-env.mjs` (skip if already run this session). Look at `lib/nodes/` and `index.ts`; check `git tag -l "v*"`, `changelog.json` beyond the blueprint placeholder, and whether a registry URL is already known. Ask whether a review report already exists for this catalog (one the human wrote, or one you produced earlier via `review.md`).
**Decide:** the catalog's layout — flat (`lib/nodes/<Node>.ts`) or per-category subfolders (`lib/nodes/<category>/<Node>.ts`); a `NodeCategory` (or similarly named) enum under `lib/enums/` versus string category literals; whether classes carry an `*Action` suffix; whether shared logic lives in `lib/helpers/`. Whether the catalog has ever published, per `../references/changelog-and-versioning.md`'s conditional gate.
**Ask:** nothing yet.
**Produce:** nothing user-facing yet.
**Done when:** you know the layout, the publish status, and whether an existing review report is the input.

**If a review report already exists,** it is the input to this sweep: skip checkpoint 1 and go straight to checkpoint 2, using the report's findings as the inventory. Don't re-derive what's already been found.

## 1. Inventory

**Gather:** run `node .agents/skills/create-high5-nodes/scripts/style.mjs effective` for the overrides in force; run the skill's lint across the whole tree (`npx eslint --no-config-lookup -c .agents/skills/create-high5-nodes/lint/eslint.config.mjs lib/nodes`, see `../lint/README.md`) rather than per-node; walk every node under `lib/nodes/` (recursing into category subfolders where the layout uses them) applying `../runbooks/review.md` checkpoints 1–3 to each.
**Decide:** nothing yet — don't fix anything, only record.
**Produce:** two tables.

- **Global** — one row per catalog-wide issue (categories, casing convention, credential types, a shared connection-input block, `Curl` placement, and anything else that recurs across nodes), each with the rule id it violates.
- **Per-node** — one row per node: name, category, spec version, published (yes/no), and the rule ids it violates.

**Done when:** every node under `lib/nodes/` has an inventory row, and the Global table captures everything that would otherwise repeat per-node.

## 2. Plan gate — the single approval

This is the one approval gate for the whole sweep; nothing is edited before a yes. Shape it like `../templates/contract-review.md`, and like the two worked review reports this runbook was modeled on: a Global table of catalog-wide changes, then per-node entries in inventory order, each stating what changes and citing the rule id.

**Gather:** the inventory from checkpoint 1 (or the supplied report).
**Decide:** classify every item — Global and per-node — with `../procedures/classify-change.md`. A catalog-wide item (e.g., renaming the category enum) is breaking only where it touches a published node's observable surface (a renamed category is cosmetic; a renamed input inside a shared connection block is not). Propose **one catalog version bump for the whole sweep** — major if any single item is breaking on a published node, otherwise minor. Separate out **decisions the human must take**: naming choices with no clear default (e.g., "members" vs. "targets"), verbs not yet in the naming vocabulary, and any rule the plan wants to override via `create-high5-nodes.config.json`.
**Ask:** post the plan; ask the separated-out decisions in rounds of at most three per `../procedures/ask.md`. Wait for approval of the whole block — "approve the Global changes, skip node X" is a valid partial approval; treat unapproved items as out of scope for checkpoint 3.
**Produce:** the plan document (Global table + per-node entries + decisions list + proposed version bump), posted as a single block.
**Done when:** the human has approved the plan, in whole or in the parts they chose to keep.

## 3. Apply

**Gather:** the approved plan.
**Decide:** order of work — catalog-wide mechanical changes first (category enum or strings, casing via enums, credential types, shared connection-input block), then per node in inventory order. Match the existing layout: don't move files between folders, don't flatten subfolders into one directory or vice versa, and don't introduce a category enum or `*Action` suffix where the catalog doesn't already use one — unless the approved plan explicitly called for that as one of its items.
**Ask:** nothing beyond what checkpoint 2 already settled. A genuinely new decision — an item turns out breaking when the plan called it non-breaking, or a node not in the inventory needs touching to make the change consistent — is out of scope; go back to checkpoint 2 rather than deciding it inline.
**Produce:** for each published node carrying a breaking item, the duplicate-version procedure in `../references/changelog-and-versioning.md`; for everything else, edit in place. Keep a running checklist (Global items, then nodes in order, each marked done/pending) in your working notes so a long sweep can resume cleanly after a context loss — re-read the approved plan and the checklist before continuing.
**Done when:** every approved item is applied, in the planned order, with no file touched that wasn't in the plan.

## 4. Wavedocs and changelog

**Gather:** the applied changes from checkpoint 3.
**Decide:** nothing new — wavedocs describe what shipped.
**Ask:** nothing.
**Produce:** run `../procedures/wavedoc.md` once per touched node (and for each duplicated `V<n>` node, its own new sidecar). Add **one `changelog.json` entry for the whole sweep**, listing the per-node changes and set `breaking` per `../references/changelog-and-versioning.md` — `true` if any item in the sweep is breaking.
**Done when:** every touched node's wavedoc matches what shipped, and the single sweep-wide changelog entry is written.

## 5. Verify

**Gather:** nothing new.
**Decide:** nothing.
**Ask:** nothing — fix what you can yourself first.
**Produce:** run

```
node .agents/skills/create-high5-nodes/scripts/verify.mjs
```

across the whole catalog; confirm zero lint warnings on touched files; run `npm run spec` for every touched node. Fix failures, re-run. Report a final table — node, what the plan called for, what actually shipped — so drift between plan and result is visible.
**Done when:** verify passes cleanly, every touched node's spec compiles, and the final table is posted.

## Rules that never bend in this runbook

- Never rename or move a file as a side effect of a mechanical change — a move is a layout decision, and layout changes need to be their own explicit plan item.
- Never edit a node that isn't in the approved plan, even one that shares the pattern being fixed — that's a proposal for the *next* sweep, not silent scope creep on this one.
- Never push or tag from here — that's `release.md`, after this runbook's changelog entry lands.
- Ask in rounds of at most three questions, per `../procedures/ask.md`.
