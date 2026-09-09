# Node specification — every field, every type

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Before writing any `specification` literal. Also when adding inputs/outputs to an existing node, when picking between V2/V3, and when wiring `additionalConnectors`.

## Curated abstraction, not transliteration

A wave node is a **curated abstraction over an API**, not a 1:1 transliteration of every field the API supports. The vendor's API surface is the upper bound on what the node *can* accept, not a target.

Curation is a node-design responsibility, not a follow-up. Before you commit to an input list, apply the pre-scaffold gates from SKILL.md Step 3:

- **Input count check** — past ~10 total inputs, stop and triage with the user. A node that exposes 20 inputs is a UX failure regardless of mandatory/advanced split.
- **Redundant-input detection** — if the API takes the same logical value in two formats (text/markdown, ID/slug, inline/URL, base64/binary), collapse to one or merge with a format toggle. Two inputs that specify the same logical value in different encodings is almost always a design error — workflow engineers can't tell which to fill, and the precedence rule (which wins if both are set?) leaks API quirks into the UI.
- **Machine-friendly value translation** — expose human-readable values and convert at the `execute()` boundary.
- **Runtime UX sanity check** — don't expose controls, especially raw pagination, that the one-shot Stream Designer runtime cannot use naturally.

## Concept

A node specification is a static, declarative object on the class. The engine reads it at load time, the Stream Designer renders it as the UI panel, and `npm run spec -- <NodeName>` extracts it to JSON for testing.

The types live in `hcloud-sdk/lib/interfaces/high5/wave`. After `npm install`, the file is at `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`.

## Pick a spec version

| Version | When to use |
|---|---|
| **V3** | **Default.** Identical to V2 plus a required `deprecated: boolean` field. New nodes are written in V3. |
| V2 | Legacy. **Do not author new nodes in V2.** When you touch an existing V2 node, propose migrating it to V3 (set `specVersion: 3`, add `deprecated: false`) in the same change set. Mention this to the user; if they decline, leave it alone. |
| V1 | Legacy. Same migration story — propose moving to V3 when you touch one. |

**Why V3 by default:** the `deprecated` flag is essential for catalog evolution — when you eventually retire a node and ship a replacement, V3 lets you mark the old one without removing it. Authoring straight in V3 keeps every node ready for that lifecycle without a future spec bump.

`node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts` exports exactly `StreamNodeSpecificationV1`, `StreamNodeSpecificationV2`, and `StreamNodeSpecificationV3` — there is no `StreamNodeSpecificationV4` in hcloud-sdk 16.0.0, and `node_modules/wave-engine/nodes/Node.js` only special-cases V1/V2/V3 wherever it branches on spec version. Conditional input visibility (what a V4 `if` DSL would give you) is parked — see `references/parked-v4-dependent-inputs.md` for what to do instead.

## V3 fields (the default for new nodes)

```typescript
{
    specVersion: 3,                              // required, literal 3
    deprecated: false,                           // required in V3 — true marks the node retired
    name: string,                                // required, UI display name
    description: string,                         // required, soft limit — see naming-and-style.md#character-limits-soft-warnings
    category: string,                            // required, pluralized entity, max 2 words
    version: StreamSemanticVersion,              // required, { major, minor, patch, changelog: string[] }
    author: StreamNodeSpecificationAuthor,       // required, { name, company, email }
    inputs?: StreamNodeSpecificationInput[],     // optional on the SDK type; almost every node has entries
    outputs?: StreamNodeSpecificationOutputV2[], // optional on the SDK type; almost every node declares at least one
    tag?: StreamNodeSpecificationTag[],          // optional, array of PREVIEW | EXPERIMENTAL
    additionalConnectors?: StreamNodeSpecificationAdditionalConnector[],  // optional
    path?: string,                               // optional, internal routing path — rarely used
    customNode?: StreamCustomNodeSpecification,  // optional, { _id, color? } for UI styling
}
```

`inputs` and `outputs` are themselves optional on the SDK type (`node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`) — a node can omit either array entirely, though in practice almost every node declares at least one output.

V3 is V2 with one new required field: `deprecated: boolean`. Set `deprecated: false` on every new node; flip to `true` only when you ship a replacement and want Stream Designer to surface the deprecation warning.

## Input types

All in `StreamNodeSpecificationInputType`. Source: `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts` — search for `enum StreamNodeSpecificationInputType`.

| Type | TS type at runtime | UI rendering | Notes |
|---|---|---|---|
| `STRING` | `string` | single-line text field | General string input |
| `STRING_LONG` | `string` | multi-line text area; expands to a CodeMirror modal with selectable syntax highlighting | Code, HTTP bodies, scripts, templates, JSON/YAML/XML, markdown, long text. See [`input-type-rules.md#string-long`](./input-type-rules.md#string-long). |
| `STRING_LIST` | `string[]` | list editor | Each element coerced to string by the engine |
| `STRING_MAP` | `Record<string, string>` | key-value pair editor | Values coerced to string |
| `STRING_READONLY` | `string` | display-only label | Pre-set; user can't edit |
| `STRING_SELECT` | `string \| number` | dropdown | Requires `options` field; value is the option *value*, not the display key. The SDK type allows `options: Record<string, string \| number>` — most catalogs use string values, but a numeric value type-checks too |
| `STRING_PASSWORD` | `string` | masked field | **Engine does NOT redact in logs.** Never `addNodeLog` this value. |
| `NUMBER` | `number` | numeric field | Engine fails the node if value can't coerce via `Number()` |
| `BOOLEAN` | `boolean` | checkbox | Accepts "true"/"false" strings; engine coerces |
| `ANY` | `unknown` | generic input | No validation; cast carefully |

**`STRING_SELECT` shape:**

```typescript
{
    name: "Method",
    description: "Choose the HTTP method",
    type: StreamNodeSpecificationInputType.STRING_SELECT,
    options: { GET: "GET", POST: "POST", DELETE: "DELETE" },  // Record<display, value>
    example: "GET",
    defaultValue: "GET",
    mandatory: true,
}
```

The `options` map is `display → value`. The user sees the display keys in the dropdown; your `execute()` receives the value.

**Input optional fields:**

- `mandatory?: boolean` — engine throws `StreamNodeInputMissingError` (code 501) if empty.
- `advanced?: boolean` — hidden in an "Advanced" accordion in the UI by default.
- `defaultValue?: any` — used if the user leaves the field empty. **Required on `BOOLEAN` inputs** — checkboxes have no unset state in Stream Designer, so an absent default leaves the field ambiguous; see [`input-type-rules.md#boolean`](./input-type-rules.md#boolean).

## Output types

All in `StreamNodeSpecificationOutputType`. Source: `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts` — search for `enum StreamNodeSpecificationOutputType`.

| Type | When to use |
|---|---|
| `STRING` | Plain text. Single values like IDs, status messages, curl commands. |
| `STRING_LONG` | Multi-line text. Logs, stdout, stderr. |
| `STRING_LIST` | Array of strings. **Always prefer over `JSON` when the runtime shape is `string[]`.** |
| `STRING_MAP` | Map / record of strings. **Always prefer over `JSON` when the runtime shape is `Record<string,string>`.** HTTP response headers, environment variables, key-value config blobs. |
| `STRING_READONLY` | Read-only display string. |
| `NUMBER` | Status codes, counts, durations, percentages. |
| `BOOLEAN` | Pass/fail flags, presence checks. |
| `JSON` | **Structured payloads only** — objects with mixed-type fields, nested data, or schemas that can't be expressed as one of the typed options above. Response bodies, entity details. |
| `XML` | XML markup. |
| `HTML` | HTML markup. |
| `ANY` | Anything else. Avoid unless you genuinely don't know the shape until runtime. |

### Picking the right output type — priority rules

Walk these in order, top to bottom. The first one that matches is the right answer:

1. **Single string** (URL, ID, status text, curl command) → `STRING`.
2. **Multi-line string** (stdout, code, logs, long text) → `STRING_LONG`.
3. **`string[]`** (parsed CSV row, tag list, file paths) → **`STRING_LIST`**, not `JSON`.
4. **`Record<string, string>`** (HTTP response headers, env vars, simple key-value config) → **`STRING_MAP`**, not `JSON`.
5. **Number** (count, percentage, status code, ms duration) → `NUMBER`.
6. **`true`/`false`** → `BOOLEAN`.
7. **XML/HTML markup** → `XML` / `HTML` respectively.
8. **Structured object with mixed-type fields, nesting, or schemas the above can't express** → `JSON`.
9. **Shape genuinely unknown until runtime** → `ANY` (rare; verify the user really wants this).

**Why prefer the specific types over `JSON`:** Stream Designer renders `STRING_LIST` as a typed list editor and `STRING_MAP` as a key-value editor. Downstream nodes binding to a `STRING_LIST` output get a real `string[]` and can iterate without `JSON.parse`. Declaring the runtime shape as `JSON` when it's actually `string[]` works at runtime but produces a worse UI and forces downstream nodes to inspect/parse what the engine already knew.

**Anti-pattern:** `type: JSON, example: ["a", "b", "c"]`. The shape is a string array — use `STRING_LIST`. Same for `type: JSON, example: { "key": "value" }` when every value is a string — use `STRING_MAP`. Reach for `JSON` only when the structure genuinely demands it (nested, mixed-type, schema-bearing).

**Output entry shape:**

```typescript
{
    name: "Task id",             // House style: sentence case (see naming-and-style.md)
    description: "Returns the id of the newly created task",
    type: StreamNodeSpecificationOutputType.STRING,
    example: "abc123",           // Realistic, not placeholder
}
```

The output type can be overridden dynamically at the `setOutput()` call site if the runtime shape differs from the spec.

## Version (StreamSemanticVersion)

```typescript
version: {
    major: 1,
    minor: 0,
    patch: 0,
    changelog: ["Initial release"],   // string[], one entry per change in this version
}
```

Bump rules (`changelog-and-versioning.md` has more detail):
- **Major** — user-visible signature change: input/output renamed, type changed, removed.
- **Minor** — backward-compatible feature: new optional input, new output, improved logic.
- **Patch** — internal fix invisible to users.

## Tags

`StreamNodeSpecificationTag.PREVIEW` — node is feature-incomplete, users should expect changes.
`StreamNodeSpecificationTag.EXPERIMENTAL` — unstable, may be removed.

In V2 this is an array: `tag: [Tag.PREVIEW]`. In V1 it was a single value.

## Additional connectors

Extra outflows that fire *during* execution. Use for mid-execution emissions: each item of a loop, each progress milestone, each chunk of a streaming response. The node still ends with Success or Fail at the end.

**Do NOT use for terminal outcomes** (404, 429, not-found, validation failure) — those throw to Fail with a three-part message. Details and the iteration idiom in `additional-connectors.md`.

```typescript
additionalConnectors: [
    {
        name: "Item",
        description:
            "Fires once per file with the path on the 'Current item' output. The wired substream completes before the next iteration begins.",
    },
    {
        name: "Progress",
        description: "Fires on each progress milestone with the percentage on the 'Progress' output",
    },
]
```

The custom ESLint rule warns if `additionalConnectors` is present but empty.

## Custom node

```typescript
customNode: {
    _id: "unique-custom-id",
    color: "#3366ff",   // optional, hex color for the tile
}
```

Used for visually-distinct nodes in the Stream Designer (e.g., your domain's branded color). Most nodes don't need this.

## The `deprecated` flag

Set `deprecated: true` when:

- A replacement node ships and you want users to migrate.
- The wrapped external service is shutting down or deprecating the API the node uses.
- The node has known bugs you won't fix (because the replacement exists).

Stream Designer surfaces deprecated nodes with a visual warning so new streams avoid them and existing streams get a nudge. Deprecated nodes keep working — `true` is a signal, not a removal.

When you do retire a node entirely, do it in two version bumps: first major-bump with `deprecated: true` (users get warning), then in a later catalog major-bump remove the node from the `Catalog(...)` registration. Never silently disappear a node.

## Conditional input visibility — parked

Need an input to appear only under specific conditions (e.g., "Bearer token" shows only when "Auth type" is "Bearer")? There's no engine-level mechanism for that today — see `references/parked-v4-dependent-inputs.md` for the full explanation and the current substitute (state the condition in the input's `description`, validate presence inside `execute()`).

## Anti-patterns

- **Marking sensitive inputs as `STRING` instead of `STRING_PASSWORD`.** Value renders in plaintext in the UI and isn't masked in logs.
- **Empty `additionalConnectors: []`** — the ESLint rule warns. Drop the field if you don't have any.
- **`example: "<your value here>"` placeholders.** Use realistic values. The example shows up in Stream Designer's spec preview.
- **Marking optional inputs `mandatory: true` to "make sure the user thinks about them".** The user fills in placeholders to get past the validation, defeating the point. Use `defaultValue` and `advanced: true` instead.
- **`type: STRING_SELECT` without `options`** — TypeScript catches this; the engine also throws.
- **Bumping `patch` on a user-visible change.** Patches are for internal fixes; signature changes are major. See `changelog-and-versioning.md`.

## Curiosity hooks

- The `StreamNodeSpecificationInputType` enum used to have more values in V1 (`INT`, `OBJECT`). V2 normalized to the table above. If you see an old node with V1 types, treat it as legacy.
- Input *coercion* happens before `execute()` runs — see `input-coercion.md` for what the engine does and what you can rely on.
- The full SDK type definition is one file: `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`. Worth a 5-minute read if you want to internalize the shape.
