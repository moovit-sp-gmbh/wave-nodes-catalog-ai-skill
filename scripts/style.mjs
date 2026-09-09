#!/usr/bin/env node
// Single entry point over style/rules.json — the source of truth for every
// engine and house-style rule this skill knows about.
//
// Usage:
//   node scripts/style.mjs validate            # schema + structural checks on rules.json
//   node scripts/style.mjs generate             # (re)write references/house-style.md
//   node scripts/style.mjs generate --check     # exit non-zero if house-style.md is stale
//   node scripts/style.mjs effective            # print the effective rule set for the
//                                                # attached repo (applies create-high5-nodes.config.json)
//   node scripts/style.mjs effective --json     # same, as JSON
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "./lib/repo-root.mjs";
import { validateRules } from "../style/lib/rules-validate.mjs";
import { generateMarkdown } from "../style/lib/markdown.mjs";
import { loadOverridesFile, computeEffective, countActiveOverrides } from "../style/lib/overrides.mjs";

const styleDir = fileURLToPath(new URL("../style/", import.meta.url));
const rulesPath = `${styleDir}rules.json`;
const schemaPath = `${styleDir}rules.schema.json`;
const lintRulesDir = fileURLToPath(new URL("../lint/rules/", import.meta.url));
const lintIndexPath = fileURLToPath(new URL("../lint/rules/index.mjs", import.meta.url));
const houseStyleMdPath = fileURLToPath(new URL("../references/house-style.md", import.meta.url));

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

function loadManifestAndSchema() {
    return { rulesManifest: readJson(rulesPath), schema: readJson(schemaPath) };
}

const [, , subcommand, ...rest] = process.argv;

switch (subcommand) {
    case "validate":
        await runValidate();
        break;
    case "generate":
        await runGenerate(rest.includes("--check"));
        break;
    case "effective":
        await runEffective(rest.includes("--json"));
        break;
    default:
        console.error(
            `Unknown or missing subcommand "${subcommand ?? ""}". Usage: style.mjs <validate|generate|effective> [--check|--json]`
        );
        process.exit(2);
}

async function runValidate() {
    const { rulesManifest, schema } = loadManifestAndSchema();
    const problems = await validateRules(rulesManifest, schema, { lintRulesDir, lintIndexPath });
    if (problems.length === 0) {
        console.log(`style/rules.json is valid (${rulesManifest.rules.length} rules).`);
        process.exit(0);
    }
    console.log(`style/rules.json has ${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}

async function runGenerate(checkOnly) {
    const { rulesManifest } = loadManifestAndSchema();
    const markdown = generateMarkdown(rulesManifest);

    if (checkOnly) {
        if (!existsSync(houseStyleMdPath)) {
            console.log("references/house-style.md does not exist — run `scripts/style.mjs generate`.");
            process.exit(1);
        }
        const current = readFileSync(houseStyleMdPath, "utf8");
        if (current === markdown) {
            console.log("references/house-style.md is up to date.");
            process.exit(0);
        }
        const currentLines = current.split("\n");
        const nextLines = markdown.split("\n");
        let firstDiff = 0;
        while (firstDiff < currentLines.length && firstDiff < nextLines.length && currentLines[firstDiff] === nextLines[firstDiff]) {
            firstDiff++;
        }
        console.log("references/house-style.md is STALE relative to style/rules.json.");
        console.log(`First differing line: ${firstDiff + 1}`);
        console.log(`  current: ${JSON.stringify(currentLines[firstDiff] ?? "(end of file)")}`);
        console.log(`  generated: ${JSON.stringify(nextLines[firstDiff] ?? "(end of file)")}`);
        console.log("Run `node scripts/style.mjs generate` to update it.");
        process.exit(1);
    }

    writeFileSync(houseStyleMdPath, markdown, "utf8");
    console.log(`Wrote references/house-style.md (${markdown.length} bytes, ${rulesManifest.rules.length} rules).`);
    process.exit(0);
}

async function runEffective(jsonOutput) {
    const { rulesManifest } = loadManifestAndSchema();
    const repoRoot = findRepoRoot(import.meta.url);
    const overridesFile = loadOverridesFile(repoRoot, rulesManifest.overridesFile);
    const effective = computeEffective(rulesManifest, overridesFile);

    if (jsonOutput) {
        console.log(
            JSON.stringify(
                {
                    repoRoot,
                    overridesFilePresent: overridesFile.present,
                    overridesFilePath: overridesFile.path,
                    rules: effective.rules,
                    errors: effective.errors,
                    activeOverrides: countActiveOverrides(effective),
                },
                null,
                2
            )
        );
        process.exit(0);
    }

    console.log(`Effective rule set — repo: ${repoRoot}`);
    console.log(
        overridesFile.present
            ? `Overrides file: ${overridesFile.path}`
            : `No overrides file found at ${overridesFile.path} — every rule is at its house-style default.`
    );
    console.log();
    console.log("| Id | Class | On | Effective options | Statement |");
    console.log("|---|---|---|---|---|");
    for (const rule of effective.rules) {
        const opts = Object.keys(rule.effectiveOptions).length > 0 ? `\`${JSON.stringify(rule.effectiveOptions)}\`` : "—";
        console.log(`| \`${rule.id}\` | ${rule.class} | ${rule.on ? "on" : "off"} | ${opts} | ${rule.statement} |`);
    }
    console.log();
    console.log(`Active overrides: ${countActiveOverrides(effective)}`);
    if (effective.errors.length > 0) {
        console.log();
        console.log("Errors:");
        for (const e of effective.errors) console.log(`  - ${e}`);
    }
    process.exit(0);
}
