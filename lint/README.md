# create-high5-nodes lint rules

Skill-contained ESLint flat config + custom rules for `specification` literals. Reads the
catalog repo's own installed `eslint`/`typescript-eslint`; never installs or writes anything.

## Rules (plugin: `create-high5-nodes`)

- **sentence-case-names** (`warn`) — spec `name`, input/output `name`, `category`, and
  STRING_SELECT `options` keys must be sentence case. Resolves enum-referenced names
  (`name: Input.TASK_ID`), reporting at the enum member. `allow: string[]` whitelists exact
  strings.
- **no-trailing-period-description** (`warn`) — any `description` inside `specification`
  (spec/input/output/additionalConnectors) must not end with `.`, `!`, or `?`.
- **example-required** (`error`) — every `inputs`/`outputs` array entry needs an `example`.
- **boolean-default-required** (`error`) — every `BOOLEAN` input needs a `defaultValue`.
- **curl-output-last** (`warn`) — an output named `Curl` must be the last `outputs` entry.
- **total-count-output-name** (`warn`) — a List node's count output must be named exactly
  `Total count`, not `<Entity> count` (e.g. `Secret count`). Resolves enum-referenced names
  like `sentence-case-names`. `allow: string[]` whitelists exact strings.

## House-style overrides

`eslint.config.mjs` reads `style/rules.json` plus the catalog repo's own `create-high5-nodes.config.json`
(via `style/lib/overrides.mjs`) and disables/re-options the three HOUSE-STYLE rules above
(`sentence-case-names`, `no-trailing-period-description`, `curl-output-last`) accordingly.
`example-required` and `boolean-default-required` are ENGINE-class and always stay enabled,
regardless of any override. Every message and `docs.description` is prefixed `[rule-id]` so a
finding maps back to its `style/rules.json` entry. See `scripts/style.mjs effective`.

## Run it

From the catalog repo root (swap `.agents` for `.claude` if installed there):

```
npx eslint --no-config-lookup -c .agents/skills/create-high5-nodes/lint/eslint.config.mjs lib/nodes
```

## Test the rules themselves

```
node .agents/skills/create-high5-nodes/lint/test/run.mjs
```

Runs ESLint's `RuleTester` against fixtures (valid + invalid, literal and enum-reference
forms) for every rule above. Exits non-zero on any failure.

## Notes

- `@typescript-eslint` is registered as a plugin (rules loaded, none enabled) only so
  existing `@typescript-eslint/...` eslint-disable comments in the repo don't error.
- Symlinked skill dirs: bare `import "typescript-eslint"` can fail to resolve; see
  `loadFromRepo` in `scripts/lib/repo-root.mjs` for the fallback + its one limitation.
