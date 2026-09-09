// Skill-contained ESLint flat config. Lives inside the catalog repo tree (under
// <repo>/.agents/skills/create-high5-nodes/lint/ or <repo>/.claude/skills/create-high5-nodes/lint/)
// so that `typescript-eslint` resolves via normal Node module resolution against
// the REPO's node_modules (Node walks up from this file's directory looking for
// a node_modules folder — it finds the repo root's, not one bundled with the
// skill). Nothing in the repo (package.json, tsconfig, the repo's own
// eslint.config.mjs, scripts/) is read or modified to make this work.
//
// Run from the repo root with:
//   npx eslint --no-config-lookup -c .agents/skills/create-high5-nodes/lint/eslint.config.mjs lib/nodes
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findRepoRoot, loadFromRepo } from "../scripts/lib/repo-root.mjs";
import createHigh5Nodes from "./rules/index.mjs";
import { loadOverridesFile, computeEffective } from "../style/lib/overrides.mjs";
import { ruleEntry as computeRuleEntry } from "../style/lib/rule-entry.mjs";

// Bare `import "typescript-eslint"` resolves fine as long as this file's real
// path is inside the repo tree (the normal case — see the two constraints this
// skill is installed under). It stops working only if the skill directory is
// itself a symlink whose target lives OUTSIDE the repo tree, because Node
// resolves bare specifiers against the file's realpath. `loadFromRepo` (see
// scripts/lib/repo-root.mjs) falls back to requiring the package by its exact
// absolute path under the repo root we independently located by walking the
// path AS GIVEN (no realpath dereference) — see that file for the one
// remaining limitation (pure-ESM-only packages).
const repoRoot = findRepoRoot(import.meta.url);
const tseslintModule = await loadFromRepo(import.meta.url, repoRoot, "typescript-eslint");
const tseslint = tseslintModule.default ?? tseslintModule;

// --- House-style overrides ---------------------------------------------------
// The user's per-repo overrides file (see style/lib/overrides.mjs for the
// shape) turns individual HOUSE-STYLE lint rules off, or extends their
// options (e.g. sentence-case-names' `allow` list). Engine-class rules
// (example-required, boolean-default-required, no-class-self-reference) never read this file — they
// stay at their configured severity no matter what the override says;
// style.mjs's `validate`/`effective` subcommands are what report an
// override-on-an-engine-rule as an error, not this config.
const rulesManifestPath = fileURLToPath(new URL("../style/rules.json", import.meta.url));
const rulesManifest = JSON.parse(readFileSync(rulesManifestPath, "utf8"));
const overridesFile = loadOverridesFile(repoRoot, rulesManifest.overridesFile);
const effective = computeEffective(rulesManifest, overridesFile);
const effectiveById = new Map(effective.rules.map((r) => [r.id, r]));

const ruleEntry = (id, defaultSeverity) => computeRuleEntry(effectiveById, id, defaultSeverity);

export default [
    { ignores: ["**/bundle.js"] },
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                sourceType: "module",
            },
        },
        plugins: {
            "create-high5-nodes": createHigh5Nodes,
            // Registered (rules loaded) but not enabled below. This is NOT here to
            // run typescript-eslint's own rules — only so ESLint recognizes rule IDs
            // referenced by pre-existing `// eslint-disable-next-line
            // @typescript-eslint/...` comments in the repo's own source. Without
            // this, ESLint hard-errors on those comments with "Definition for rule
            // '@typescript-eslint/...' was not found" even though we never asked it
            // to check that rule.
            "@typescript-eslint": tseslint.plugin,
        },
        rules: {
            "create-high5-nodes/sentence-case-names": ruleEntry("sentence-case-names", "warn"),
            "create-high5-nodes/no-trailing-period-description": ruleEntry("no-trailing-period-description", "warn"),
            "create-high5-nodes/example-required": ruleEntry("example-required", "error"),
            "create-high5-nodes/boolean-default-required": ruleEntry("boolean-default-required", "error"),
            "create-high5-nodes/curl-output-last": ruleEntry("curl-output-last", "warn"),
            "create-high5-nodes/no-class-self-reference": ruleEntry("no-class-self-reference", "error"),
            "create-high5-nodes/total-count-output-name": ruleEntry("total-count-output-name", "warn"),
        },
    },
];
