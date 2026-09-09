# create-high5-nodes scripts

Plain Node ESM. Every script locates the catalog repo by walking UP from its OWN file
location to the nearest `package.json` declaring `wave-engine`, and only if that fails
(the skill directory is a symlink to a store outside the repo, so Node reports the real
path) falls back to walking up from `process.cwd()` — see `lib/repo-root.mjs`. Run the
scripts from the catalog root and both cases work. That's how they work whether the skill lives at
`<repo>/.agents/skills/create-high5-nodes/`, `<repo>/.claude/skills/create-high5-nodes/`, or
anywhere else, and regardless of the directory you invoke them from.

**No repo files are ever modified.** These scripts only read the repo (source, package.json,
node_modules) and run only binaries found in the repo's own `node_modules/.bin` (a missing
binary is reported, never fetched via `npx`) and print/write the output the caller asked for (stdout, or a `--out` file
outside the repo). `package.json`, `eslint.config.mjs`, `tsconfig*.json`, and `scripts/` in
the catalog repo are never touched.

## Scripts

- **`lib/repo-root.mjs`** — not runnable; shared helpers (`findRepoRoot`, `bin`, `run`,
  `loadFromRepo`) used by every script below.
- **`check-env.mjs`** — sanity-checks the repo before anything else trusts it: Node version,
  `node_modules` presence, `wave-engine`/`hcloud-sdk` installed versions vs. `package.json`
  ranges, the `.d.ts` files the other scripts depend on, and the repo's own base files
  (`lib/Node.ts`, `lib/Catalog.ts`, `index.ts`, `changelog.json`, `tsconfig.lib.json`).
  `--json` prints a JSON summary instead of the table.
- **`verify.mjs`** — runs typecheck, the skill's lint config, a `style/rules.json` validity +
  active-override check, a `prettier --check lib/nodes/**/*.ts` formatting check, the catalog's
  tests (if `tests/` exists: `jest --roots <rootDir>/tests` when the catalog declares `jest` or `ts-jest` as a
  dependency or its `test` script is `jest`, otherwise the catalog's own `npm test` script, e.g. `node --test`; `SKIP` when it
  has neither — never a runner pulled in via `npx`), an orphan-test check (every `tests/**/*.test.ts` must import a `lib/nodes` module
  that still exists), wavedoc-sibling checks, `index.ts` registration checks, and a changelog
  semver check; prints a pass/fail table and a verdict. The wavedoc, orphan-test, and
  registration checks walk `lib/nodes/` (and `tests/`) recursively, so catalogs that group
  nodes in per-category subfolders are covered. Files whose default export is an `abstract`
  class (base classes such as `ActionNode`, `ConditionNode`, `CustomNode`) are not nodes —
  `new Catalog(...)` rejects an abstract constructor — and are skipped by the wavedoc,
  scaffold and registration checks; the summary line says how many were skipped.
  `--only <check,...>` (slugs: `typecheck`, `lint`, `style`, `format`, `jest` — the test slug,
  kept for compatibility even when the runner is `npm test` — `wavedoc`,
  `scaffold`, `orphan-tests`, `registration`, `changelog`), `--node <Name>` (scope
  wavedoc/registration to one node), `--json`. `format` reports `SKIP` when prettier isn't
  installed in the catalog's own `node_modules/.bin`.
- **`style.mjs`** — `validate` (schema + structural checks on `style/rules.json`), `generate`
  (writes `references/house-style.md`, `--check` diffs without writing), `effective`
  (applies the repo's `create-high5-nodes.config.json` and prints the resulting rule set,
  `--json` for machine output). See `style/rules.json` and `style/lib/`.
- **`engine-surface.mjs`** — reads the installed `wave-engine`/`hcloud-sdk` packages and
  prints markdown describing what the skill can generate from them (helper classes, input/
  output type enums, spec versions and their fields, duplicate-handling enums, tags) plus a
  "Not generatable" section for the wildcard vocabulary. `--out <file>` writes the markdown
  there; otherwise it prints to stdout.

## Invocation (from the catalog repo root)

```
node .agents/skills/create-high5-nodes/scripts/check-env.mjs [--json]
node .agents/skills/create-high5-nodes/scripts/verify.mjs [--json] [--only c1,c2] [--node Name]
node .agents/skills/create-high5-nodes/scripts/engine-surface.mjs [--out surface.md]
```

(swap `.agents` for `.claude` depending on where the skill is installed — or invoke by
absolute path from anywhere; none of these depend on cwd.)

## Exit codes

`0` on success. `check-env.mjs` and `verify.mjs` exit `1` if any check FAILs (a `WARN` or
`SKIP` never fails the exit code). `engine-surface.mjs` has no pass/fail notion — it exits
non-zero only on an unhandled error (e.g. a required `.d.ts` genuinely absent from disk).
