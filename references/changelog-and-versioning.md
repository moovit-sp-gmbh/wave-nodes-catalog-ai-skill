# Changelog and versioning

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Any time a node is created or modified, or a catalog release is being cut. This file is the canonical reference for the breaking-change taxonomy, the published-vs-unpublished conditional gate, and the new-major-version duplication procedure summarized in **SKILL.md Step 8**.

## The conditional gate — versionize only what's been shipped

**Per-node versioning only applies to nodes that have been bundled and shipped in a published catalog release.** A node nobody has ever wired into a deployed stream has no users to protect, so changing it freely is cheap and correct.

| Scenario | Versionize the node? |
|---|---|
| Catalog has never been published (no production release tag). | **No.** Edit in place. No `specification.version` bump, no class duplication. |
| Catalog is published, but this specific node has never been bundled in a release (newly added since the last tag). | **No.** It has no end users yet. Edit in place. |
| Node was bundled in a previous published release and is now being changed. | **Yes** — classify per the taxonomy below; follow the matching procedure. |

The agent should determine which scenario applies by inspecting: (a) any git tags on the repo? (b) was this node's file present at the most recent published tag? When unclear, ask the user explicitly — don't guess.

**`changelog.json` is independent of this gate.** The catalog-level changelog gets a top entry on *every* release, even if no individual node's `specification.version` changed (e.g., the release adds brand-new nodes, bumps a dependency, fixes the README).

## The breaking-change taxonomy

A change to a previously-published node is **breaking** if any of the following is true.

### Input surface

1. **Existing input is removed.** Streams referencing it lose their wiring.
2. **Existing input is renamed.** Same effect — streams can't find it under the new name.
3. **Existing input's type changes.** Engine type coercion produces different values; downstream logic shifts.
4. **A new mandatory input is added** — even with a sensible default. Workflow engineers who don't update their streams may not realize the default is now governing behavior.
5. **Any existing non-mandatory input is promoted to `mandatory`.** This includes `advanced: true → mandatory: true`, an inline optional input gaining `mandatory: true`, and an input that was explicitly `mandatory: false` flipping to `true`. Every stream that omitted the input — relying on a default, on the value being optional, or simply on it being out of sight under Advanced — now fails at validation the next time it runs. The "previously omittable, now required" transition is what matters; the input's prior visibility flag does not.
6. **A `STRING_SELECT` input's option *value* is removed or renamed.** The value is what streams hard-code; the display key is safe to change.
7. **Input validation is tightened** so previously-accepted inputs now reject.

### Output surface

8. **Existing output is removed.** Downstream wirings break.
9. **Existing output is renamed.** Same effect.
10. **Existing output's type changes.** Downstream type assumptions break.
11. **An existing additional connector is removed or renamed.** Streams wired to that connector edge break.

### Behavior / semantics

12. **The node now throws to Fail in scenarios that previously resolved successfully.** Success-path branches downstream stop running.
13. **The node now resolves successfully in scenarios that previously threw to Fail.** Fail-edge handlers stop firing.
14. **The node's observable behavior changes for the same inputs** — different outputs, different side effects, different resources created. **This includes bug fixes that change observed behavior in any corner case.** We don't take chances with existing workflows; if you think a stream might depend on the buggy behavior, version the node.
15. **Auth mechanism changes** (e.g., basic auth → bearer-only).
16. **The node starts depending on a `this.wave.*` helper added in a newer engine version** than what existing streams' engines provide.

### Class identity

17. **The TypeScript class name changes.** The class name is the lookup key in `Catalog`'s internal map and what Stream Designer references when wiring streams — renaming it breaks every existing stream that uses the node. The spec's `name` field is purely UI and can be renamed freely; Stream Designer relabels the existing entry without breaking wirings.

### Not breaking (safe to edit in place)

- A new *advanced* input with a sensible default that reproduces prior behavior exactly.
- A new output that didn't exist before.
- **Adding a new curated output that was previously only accessible via the raw response object** (e.g., adding a `Task assignee` output when `Task` (the raw JSON) already exposed the assignee). The raw output already surfaced the data — adding a typed accessor is purely additive and doesn't change any existing field. See `references/naming-and-style.md` for the raw-response-last rule.
- A new additional connector.
- Marking the node `deprecated: true` (V3 flag) — informational.
- Spec `name`, `description`, `category`, or `example` value changes.
- Adding new option *values* to a `STRING_SELECT` (existing values must stay).
- Internal refactor producing byte-identical observable outputs.

**When in doubt, treat as breaking.** Creating a new major version is cheap; breaking a deployed stream is not.

## Procedure: breaking change to a published node

Before editing, walk the user through the impact in plain English. The agent must be polite and friendly — published nodes are referenced by deployed streams the user may not control, and silently changing them breaks production for downstream customers.

> *"The change you've described is breaking — it would `<plain-English impact>`. To protect existing workflows, I'll create a new major version of this node alongside the existing one. The old version stays untouched (and we can mark it `deprecated` if you want workflow engineers nudged to migrate). Does that approach work?"*

Once confirmed, **the house rule is Option 1 (separate file per version):**

### Option 1 — separate file per version (recommended)

Worked example: changing `CreateTicket`'s `TicketId` output to a `Ticket` object.

1. **Duplicate the class.** Old class name `CreateTicket` → new class name `CreateTicketV2`. Subsequent breaking changes increment the suffix (`V3`, `V4`, …).
2. **Duplicate the implementation file.** `lib/nodes/CreateTicket.ts` → `lib/nodes/CreateTicketV2.ts`. The original file stays untouched.
3. **Apply the breaking change in the new file only.** Update inputs/outputs/behavior in `CreateTicketV2.ts`; leave `CreateTicket.ts` exactly as it was.
4. **In the new spec, keep `name` identical to the old spec** — `"Create ticket"` in both. Stream Designer displays the same label across versions; users disambiguate via the per-node version metadata. Bump `specification.version.major` by exactly one; reset `minor` and `patch` to `0`. The in-spec `changelog` array (V3 spec) describes what changed in this new major.
5. **Register both classes in `index.ts`.** Import the new class alongside the old; add both to the `new Catalog(...)` varargs:

   ```typescript
   import CreateTicket from "./lib/nodes/CreateTicket";
   import CreateTicketV2 from "./lib/nodes/CreateTicketV2";

   export default new Catalog(
       "Jitbit",
       "Nodes for creating, updating, and querying Jitbit tickets from helmut.cloud streams.",
       "https://example.com/jitbit-logo.webp",
       "2.4.0",
       CreateTicket,
       CreateTicketV2,   // both versions ship
   );
   ```

6. **Duplicate the documentation file.** `lib/nodes/CreateTicket.md` → `lib/nodes/CreateTicketV2.md`. Update every part of the new doc that reflects the breaking change (input list, output list, behavior, examples). Both `.md` files ship.
7. **Optional:** Mark the old node `deprecated: true` in its spec (V3 flag) if the user wants workflow engineers nudged to migrate. The old node continues to function fully; the flag is informational.
8. **Add a top entry to `changelog.json`** with `breaking: true` describing the new major version:

   ```json
   {
     "description": "Add CreateTicket v2 with structured Ticket output (replaces v1's TicketId string)",
     "type": "Features",
     "breaking": true
   }
   ```

### Option 2 — both versions in the same `.ts` file

Only offered if the user explicitly pushes back on Option 1. The agent should recommend Option 1 first (cleaner git history, clearer documentation boundaries), but accept Option 2 if the user prefers it. Same rules apply: new class name with `V<n>` suffix, spec `name` identical across versions, only `specification.version.major` increments. The `.md` file is still duplicated.

## Procedure: non-breaking change to a published node

1. Edit `<NodeName>.ts` and `<NodeName>.md` in place. No file or class duplication.
2. Bump `specification.version`:
   - **Minor** (`1.0.x → 1.1.0`) — new advanced input with default, new output, new additional connector, expanded `STRING_SELECT` option list (additions only), new feature in `execute()` that doesn't change behavior for prior inputs.
   - **Patch** (`1.0.0 → 1.0.1`) — refactor with byte-identical outputs, dependency bump that doesn't change behavior, documentation-only fixes.
3. **Confirm the bump magnitude with the user** before writing — lightweight propose-and-confirm:
   > *"I'd call this a minor bump (added a new advanced input with a default). Sound right, or do you read it differently?"*
4. Add a top entry to `changelog.json` describing the change with `breaking: false`.
5. **Sweep for legacy type-specific violations while you're in the file.** If the node has `BOOLEAN` inputs declared with `mandatory: false` and no `defaultValue`, propose adding the default in the same change set — it's a non-breaking minor (the engine was already coercing `undefined`, so the explicit default matches existing observed behavior). Other type-specific rules accumulate in [`input-type-rules.md`](./input-type-rules.md); a quick read-through there is worth the 60 seconds when you're touching a published node. If the user declines, leave it.

## Two version surfaces

| Surface | Where | Audience |
|---|---|---|
| **Per-node `specification.version`** | Inside each node's TS file: `version: { major, minor, patch, changelog: string[] }` | Workflow engineers in Stream Designer — surfaced wherever Stream Designer shows node metadata (info panel / tooltip / details view) |
| **Catalog-wide `changelog.json`** | Root of the catalog repo | GitHub readers; release-notes consumers; Stream Designer's catalog details view |

The in-spec `changelog` array is a list of one-line, user-facing entries describing what changed in *this* version of the node:

```typescript
version: {
    major: 1,
    minor: 2,
    patch: 0,
    changelog: [
        "Added 'Follow Redirects' option (advanced)",
        "Improved error message when SSL certificate is invalid",
    ],
}
```

Don't reset the changelog array on bumps — it represents *this version's* changes (older versions' changelogs persist in git history).

## Catalog-wide `changelog.json`

The blueprint's `changelog-howTo.md` is the authoritative source. Quick recap:

```json
[
  {
    "version": "1.2.0",
    "date": "2026-05-19",
    "changes": [
      {
        "description": "Add HTTP retry support with exponential backoff",
        "type": "Features",
        "breaking": false
      }
    ]
  }
]
```

**Rules:**

- New releases go at the **top** of the array.
- Never remove old releases.
- `type` is one of: `Features`, `Bug Fixes`, `Code Refactoring`, `Performance Improvements`, `Miscellaneous Chores`.
- `breaking: true` only for code-breaking changes (signatures, behavior). Tone changes, refactors, performance — these are `breaking: false`.
- Non-breaking-only releases (refactors, perf, chores) usually bundle into the next user-visible release rather than shipping as their own.

## Bumping the catalog version

The catalog version is what users see in **Manage node catalogs** in Stream Designer.

- **Catalog major bump** when *any* node majors. If `CreateTicket` goes to v2, the catalog majors too.
- **Catalog minor bump** when any node minors and nothing majored, or when new nodes are added.
- **Catalog patch bump** when only patches happened.
- **First public release** is `v1.0.0`. Don't ship `v0.x` to customers.

## Git tag → S3 publish

The catalog version in `changelog.json` is what the publish pipeline reads from. The git tag you push (`vX.Y.Z`) triggers the GitHub Actions workflow that uploads to S3 under `<destination>/<version>/bundle.js`. Tag and version must match.

```bash
git add .
git commit -m "feat: add CreateTicketV2 with structured output"
git tag v2.0.0           # matches the top entry in changelog.json
git push origin v2.0.0
```

## Dev releases (pre-release)

Tags like `v1.2.0-dev-5` are allowed for testing. Stream Designer can show or hide dev releases via a UI toggle. Changelog entries for dev releases are optional. Dev releases don't gate the published-vs-unpublished conditional differently — if a node went out in a dev release that customers actually consumed, treat it as published.

## Patterns

**Renaming an input in a published node (signature change, rule #2):**

- Breaking. Use the Option 1 procedure → new `<NodeName>V<n>.ts`, spec `name` identical, major bump.
- Catalog: major bump in `changelog.json`.
- Entry: *"Add CreateTicket v2 with renamed 'Body' input (replaces v1's 'Body Content')"* with `breaking: true`.

**Adding an advanced input with a default to a published node (non-breaking):**

- Minor bump on the existing node, edit in place.
- Catalog: minor bump.
- Entry: *"Add 'Timeout' advanced input to HTTP Client"* with `breaking: false`.

**Fixing a bug in a published node:**

- **Default to breaking** (rule #14). Even if the user is confident no one depended on the buggy behavior, our rule is to err on the side of caution. Use the Option 1 procedure.
- If — and only if — the user explicitly confirms the bug had no observable effect on streams (e.g., a typo in a log message, a dead code path), treat as patch and edit in place.

**Adding a new node to an existing published catalog:**

- The *new* node doesn't get versionized (it has no users yet — conditional gate, scenario 2).
- The catalog still bumps (minor) and gets a `changelog.json` entry.
- Entry: *"Add UpdateTicket node"* with `breaking: false`.

**Marking a node deprecated:**

- The node still works. Per-node: minor bump *and* upgrade to V3 spec to add `deprecated: true` (if not already V3).
- Catalog: minor bump.
- Entry: *"Mark old `CreateTicket` (v1) as deprecated — use v2"*.

## Anti-patterns

- **Versioning a node that's never been published.** No users to protect; you're just cluttering the codebase. Edit in place.
- **Versioning a brand-new node added to an existing published catalog.** Same — no users yet.
- **Patch bump on a user-visible behavioral change.** If the user can tell, it's breaking (rule #14). Major bump and duplicate.
- **Changing a class name in place on a published node.** Breaks every existing stream wired to it (rule #17). Always use the duplication procedure.
- **Different spec `name` across versions of the same node** (e.g., `"Create ticket"` for v1 and `"Create ticket V2"` for v2). The version metadata disambiguates; the display name should stay the same.
- **Forgetting the per-node in-spec `changelog` array.** Stream Designer surfaces it in the node-info UI; an empty array is a missed UX detail.
- **Listing implementation details in user-facing entries.** *"Refactored axios config to use removeEmptyFields"* tells the workflow engineer nothing. Say what changed for them: *"Cleaner request payloads when optional fields are empty"*.
- **`breaking: true` on a refactor.** Internal-only; user can't tell. Set `breaking: false`.
- **Mismatching the git tag and the top entry in `changelog.json`.** Publish pipeline reads the version from the tag; if changelog says `1.2.0` and tag is `v1.3.0`, the bundle ends up under `/1.3.0/` while users looking at the changelog expect `/1.2.0/`. Keep them in sync.

## Curiosity hooks

- The blueprint's `changelog-howTo.md` is worth reading once for the full convention. This file is a faithful summary plus the operational details on git tag / publish and the breaking-change taxonomy.
- The Agent caches catalogs by MD5 of URL + version, so changing the version automatically busts the cache. Same version = same cache; this is why you should never overwrite a published version.
- Versioning nodes *independently* of the catalog is unusual for some toolchains (most use a single version). The wave model has both because Stream Designer surfaces per-node version info in its UI — useful for "is this v1 or v2 of CreateTicket?".
- Multiple versions of the same node share the spec `name` but have different class names. Stream Designer disambiguates via the per-node version metadata, not the display name.
