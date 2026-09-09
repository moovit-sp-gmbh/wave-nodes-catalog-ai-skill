#!/usr/bin/env node
// Standalone catalog verifier. Plain Node + the repo's OWN installed
// devDependencies (typescript, eslint, and whatever test runner the catalog
// declares) — nothing new installed by the skill, nothing fetched via npx,
// nothing in the repo written to. Locates the repo root by walking up
// from this file's own location, so it works regardless of cwd or where the
// skill is installed (.agents/skills/... or .claude/skills/...).
//
// Usage (from anywhere):
//   node scripts/verify.mjs [--json] [--only check,check,...] [--node Name]
//
// Checks (the --only slugs, in run order): typecheck, lint, style, format,
// jest (the catalog's test suite — slug kept for compatibility, see step 3),
// wavedoc, scaffold, orphan-tests, registration, changelog.
//
// Abstract base classes under lib/nodes (e.g. `export default abstract class
// ActionNode extends Node {}`) are not nodes: they cannot be passed to
// `new Catalog(...)`, ship no wavedoc, and are skipped by the wavedoc,
// scaffold and registration checks.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot, bin, run, loadFromRepo } from "./lib/repo-root.mjs";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex !== -1 ? args[onlyIndex + 1].split(",").map((s) => s.trim()) : null;
const nodeIndex = args.indexOf("--node");
const nodeFilter = nodeIndex !== -1 ? args[nodeIndex + 1] : null;

const repoRoot = findRepoRoot(import.meta.url);
const lintConfigPath = fileURLToPath(new URL("../lint/eslint.config.mjs", import.meta.url));

const ts = (await loadFromRepo(import.meta.url, repoRoot, "typescript")).default;

const results = [];
function record(key, name, status, detail = "") {
    results.push({ key, name, status, detail });
}

function shouldRun(key) {
    return !only || only.includes(key);
}

function tail(text, n = 15) {
    return (text || "")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .slice(-n)
        .join("\n");
}

function runBin(name, args, opts = {}) {
    const exe = bin(repoRoot, name);
    if (!existsSync(exe)) {
        // Never fall back to `npx <name>`: when the shim is missing from the
        // catalog's node_modules/.bin, npx resolves from the user's global npx
        // cache (or the network) and runs a tool the catalog never declared.
        // That produced a bogus "22 suites failed, 0 tests" against a catalog
        // that does not use jest at all. Report the missing binary instead.
        return {
            status: 127,
            stdout: "",
            stderr: `${name} not found in node_modules/.bin — install the catalog's own devDependencies (npm ci) or drop this check`,
        };
    }
    return run(exe, args, { cwd: repoRoot, ...opts });
}

// Reads the catalog's package.json once; every consumer tolerates a missing
// or malformed file by treating it as empty.
function readPackageJson() {
    try {
        return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    } catch {
        return {};
    }
}
const pkg = readPackageJson();
const pkgDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

// --- 1. TypeScript ------------------------------------------------------------
if (shouldRun("typecheck")) {
    const libConfig = join(repoRoot, "tsconfig.lib.json");
    const fallbackConfig = join(repoRoot, "tsconfig.json");
    const configPath = existsSync(libConfig) ? libConfig : fallbackConfig;
    const configLabel = existsSync(libConfig) ? "tsconfig.lib.json" : "tsconfig.json (fallback — tsconfig.lib.json not found)";

    const res = runBin("tsc", ["--noEmit", "-p", configPath]);
    const ok = res.status === 0;
    record("typecheck", `tsc --noEmit (-p ${configLabel})`, ok ? "PASS" : "FAIL", ok ? "" : tail(res.stdout || res.stderr));
}

// --- 2. Skill-contained ESLint config -----------------------------------------
if (shouldRun("lint")) {
    const res = runBin("eslint", ["--no-config-lookup", "-c", lintConfigPath, "lib/nodes"]);
    const ok = res.status === 0;
    const summaryLine = (res.stdout || "").trim().split("\n").filter(Boolean).pop() || "";
    record("lint", "eslint (skill config)", ok ? "PASS" : "FAIL", ok ? summaryLine : tail(res.stdout || res.stderr));
}

// --- 2b. style/rules.json validity + active-override count -------------------
if (shouldRun("style")) {
    const { validateRules } = await import(new URL("../style/lib/rules-validate.mjs", import.meta.url));
    const { loadOverridesFile, computeEffective, countActiveOverrides } = await import(
        new URL("../style/lib/overrides.mjs", import.meta.url)
    );
    const rulesManifest = JSON.parse(readFileSync(fileURLToPath(new URL("../style/rules.json", import.meta.url)), "utf8"));
    const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../style/rules.schema.json", import.meta.url)), "utf8"));
    const lintRulesDir = fileURLToPath(new URL("../lint/rules/", import.meta.url));
    const lintIndexPath = fileURLToPath(new URL("../lint/rules/index.mjs", import.meta.url));

    const problems = await validateRules(rulesManifest, schema, { lintRulesDir, lintIndexPath });
    const overridesFile = loadOverridesFile(repoRoot, rulesManifest.overridesFile);
    const effective = computeEffective(rulesManifest, overridesFile);
    const activeOverrides = countActiveOverrides(effective);

    const ok = problems.length === 0;
    record(
        "style",
        `style.mjs validate (rules.json) — ${activeOverrides} active override${activeOverrides === 1 ? "" : "s"}`,
        ok ? "PASS" : "FAIL",
        problems.join("\n")
    );
}

// --- 2c. Prettier formatting on lib/nodes -------------------------------------
if (shouldRun("format")) {
    const exe = bin(repoRoot, "prettier");
    if (!existsSync(exe)) {
        record("format", "prettier --check lib/nodes", "SKIP", "prettier is not installed in this catalog's node_modules/.bin");
    } else {
        const res = run(exe, ["--check", "lib/nodes/**/*.ts"], { cwd: repoRoot });
        const ok = res.status === 0;
        record("format", "prettier --check lib/nodes", ok ? "PASS" : "FAIL", ok ? "" : tail(`${res.stdout || ""}\n${res.stderr || ""}`));
    }
}

// --- 3. Tests (only if tests/ exists) -----------------------------------------
// Slug stays "jest" so existing --only invocations keep working, but the runner
// follows the catalog: jest when the catalog declares it as a dependency
// (the blueprint default), otherwise the catalog's own `npm test` script
// (e.g. wave-nodes uses `node --test -r ts-node/register ...`). A catalog with
// neither is SKIPped, never failed by a runner it does not ship.
if (shouldRun("jest")) {
    const testsDir = join(repoRoot, "tests");
    const testScript = typeof pkg.scripts?.test === "string" ? pkg.scripts.test.trim() : "";
    // The blueprint and its descendants declare ts-jest (not jest itself) and a
    // plain `"test": "jest"` script, so detect any of those three shapes.
    const usesJest = "jest" in pkgDeps || "ts-jest" in pkgDeps || /^jest(\s|$)/.test(testScript);
    if (!existsSync(testsDir)) {
        record("jest", "tests", "SKIP", "no tests/ directory");
    } else if (usesJest) {
        // IMPORTANT: plain jest with no scoping would also pick up any *.test.ts
        // file ANYWHERE under the repo, including inside the skill's own
        // directories if any test-shaped files exist there. --roots pins
        // discovery to the catalog's own tests/ directory.
        const res = runBin("jest", ["--roots", "<rootDir>/tests"]);
        const ok = res.status === 0;
        const summaryMatch = (res.stderr || res.stdout || "").match(/Tests:\s+.*/);
        record("jest", "jest --roots <rootDir>/tests", ok ? "PASS" : "FAIL", ok ? summaryMatch?.[0] ?? "" : tail(res.stderr || res.stdout));
    } else if (testScript) {
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        const res = run(npm, ["test", "--silent"], { cwd: repoRoot });
        const ok = res.status === 0;
        const out = `${res.stdout || ""}\n${res.stderr || ""}`;
        // node --test prints "# pass N" / "# fail N"; other runners get the tail.
        const pass = out.match(/^# pass (\d+)/m)?.[1];
        const fail = out.match(/^# fail (\d+)/m)?.[1];
        const summary = pass !== undefined ? `pass ${pass}, fail ${fail ?? "?"}` : "";
        record("jest", `npm test (${testScript.split(/\s+/).slice(0, 2).join(" ")} …)`, ok ? "PASS" : "FAIL", ok ? summary : `${summary}\n${tail(out)}`.trim());
    } else {
        record("jest", "tests", "SKIP", "tests/ exists but package.json declares neither jest nor a test script");
    }
}

// Parses the default-exported class of a lib/nodes file. Returns
// { name, isAbstract } or null when the file has no default-exported class.
function defaultExportClass(filePath) {
    const text = readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let found = null;
    ts.forEachChild(sf, (node) => {
        if (ts.isClassDeclaration(node) && node.name) {
            const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
            const has = (kind) => mods?.some((m) => m.kind === kind) ?? false;
            if (has(ts.SyntaxKind.DefaultKeyword) && has(ts.SyntaxKind.ExportKeyword)) {
                found = { name: node.name.text, isAbstract: has(ts.SyntaxKind.AbstractKeyword) };
            }
        }
    });
    return found;
}

// Abstract base classes (ActionNode, ConditionNode, CustomNode, ...) live under
// lib/nodes in some catalogs but are not nodes — `new Catalog(...)` rejects an
// abstract constructor, and Stream Designer never renders them.
function isAbstractNodeFile(absPath) {
    return defaultExportClass(absPath)?.isAbstract === true;
}

// listNodeTsFiles minus the abstract base classes; used by wavedoc/scaffold/registration.
function listConcreteNodeTsFiles(nodesDir) {
    const all = listNodeTsFiles(nodesDir);
    const concrete = all.filter((rel) => !isAbstractNodeFile(join(nodesDir, rel)));
    return { concrete, skippedAbstract: all.length - concrete.length };
}
const skippedNote = (n) => (n ? `, ${n} abstract base class${n === 1 ? "" : "es"} skipped` : "");

// Lists every .ts file under lib/nodes, recursing into per-category subfolders
// (e.g. lib/nodes/high5Events/CreateEvent.ts). Returns paths relative to nodesDir.
function listNodeTsFiles(dir, prefix = "") {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            out.push(...listNodeTsFiles(join(dir, entry.name), `${prefix}${entry.name}/`));
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
            out.push(`${prefix}${entry.name}`);
        }
    }
    return out;
}

// Lists every *.test.ts file under a directory, recursing into subfolders.
// Returns absolute paths.
function listTestFiles(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listTestFiles(abs));
        } else if (entry.name.endsWith(".test.ts")) {
            out.push(abs);
        }
    }
    return out;
}

// --- 3b. Every tests/**/*.test.ts's lib/nodes import resolves to a real file -
// A test left behind after its node was deleted (e.g. removing the blueprint's
// sample HttpClient node without removing tests/nodes/HttpClient.test.ts) fails
// jest with a confusing module-not-found error. Catch it by name instead.
if (shouldRun("orphan-tests")) {
    const testsDir = join(repoRoot, "tests");
    const nodesDir = join(repoRoot, "lib/nodes");
    const validNodeFiles = new Set(listNodeTsFiles(nodesDir)); // e.g. "HttpClient.ts", "high5Events/CreateEvent.ts"
    const importRe = /from\s+["']((?:\.\.\/)+lib\/nodes\/[^"']+)["']/g;
    const problems = [];
    let checked = 0;

    for (const testFile of listTestFiles(testsDir)) {
        checked++;
        const text = readFileSync(testFile, "utf8");
        let match;
        while ((match = importRe.exec(text)) !== null) {
            const importPath = match[1]; // e.g. "../../lib/nodes/HttpClient"
            const importedAbs = join(dirname(testFile), importPath);
            const relToNodes = relative(nodesDir, importedAbs).split("\\").join("/");
            const candidates = [`${relToNodes}.ts`, relToNodes];
            const resolves = candidates.some((c) => validNodeFiles.has(c)) || existsSync(`${importedAbs}.ts`) || existsSync(importedAbs);
            if (!resolves) {
                problems.push(`${relative(repoRoot, testFile)} -> imports "${importPath}" but lib/nodes/${relToNodes}.ts does not exist`);
            }
        }
    }

    record(
        "orphan-tests",
        `tests/**/*.test.ts import a real lib/nodes module (${checked} test file${checked === 1 ? "" : "s"} checked)`,
        problems.length === 0 ? "PASS" : "FAIL",
        problems.join("\n")
    );
}

// --- 4. Every lib/nodes/*.ts has a sibling .md starting with ::wavedoc -------
if (shouldRun("wavedoc")) {
    const nodesDir = join(repoRoot, "lib/nodes");
    let { concrete: tsFiles, skippedAbstract } = listConcreteNodeTsFiles(nodesDir);
    if (nodeFilter) tsFiles = tsFiles.filter((f) => basename(f) === `${nodeFilter}.ts`);
    const missing = [];
    for (const tsFile of tsFiles) {
        const mdPath = join(nodesDir, tsFile.replace(/\.ts$/, ".md"));
        if (!existsSync(mdPath)) {
            missing.push(`${tsFile} -> no sibling .md`);
            continue;
        }
        const firstLine = readFileSync(mdPath, "utf8").split("\n")[0].trim();
        if (firstLine !== "::wavedoc") {
            missing.push(`${tsFile} -> ${basename(mdPath)} first line is "${firstLine}", not "::wavedoc"`);
        }
    }
    record(
        "wavedoc",
        `lib/nodes/**/*.ts wavedoc siblings (${tsFiles.length} file${tsFiles.length === 1 ? "" : "s"} checked${nodeFilter ? `, filtered to ${nodeFilter}` : ""}${skippedNote(skippedAbstract)})`,
        missing.length === 0 ? "PASS" : "FAIL",
        missing.join("\n")
    );
}

// --- 4b. No scaffold placeholders survive in lib/nodes (ts or md) ------------
// new-node.sh writes recognisable placeholders; a node is not done while any of them
// remains, even inside a comment. Slug: "scaffold".
// Every marker carries a "TODO:" prefix on purpose: a bare `RESULT = "Result"`
// used to be a marker and collided with a legitimate enum member in a real node
// ("Result" is the natural name for a single-output node). Keep this list in
// sync with scripts/new-node.sh.
if (shouldRun("scaffold")) {
    const nodesDir = join(repoRoot, "lib/nodes");
    const markers = [
        "TODO: input name",
        "TODO: output name",
        "TODO: one short sentence about what this node does",
        "TODO: what to put in this input",
        "TODO: what this output contains",
        "TODO: implement the action",
        "TODO: one or more sentences describing what the node accomplishes",
        "TODO: explain what to put in this input",
    ];
    const leftovers = [];
    let checked = 0;
    for (const rel of listConcreteNodeTsFiles(nodesDir).concrete) {
        if (nodeFilter && basename(rel) !== `${nodeFilter}.ts`) continue;
        for (const candidate of [rel, rel.replace(/\.ts$/, ".md")]) {
            const abs = join(nodesDir, candidate);
            if (!existsSync(abs)) continue;
            checked++;
            const text = readFileSync(abs, "utf8");
            for (const m of markers) {
                if (text.includes(m)) leftovers.push(`${candidate} -> still contains "${m}"`);
            }
        }
    }
    record(
        "scaffold",
        `no new-node.sh placeholders left in lib/nodes (${checked} file${checked === 1 ? "" : "s"} checked)`,
        leftovers.length === 0 ? "PASS" : "FAIL",
        leftovers.join("\n")
    );
}

// --- 5. Every class in lib/nodes is imported + registered in index.ts --------
if (shouldRun("registration")) {
    const nodesDir = join(repoRoot, "lib/nodes");
    const indexPath = join(repoRoot, "index.ts");
    const problems = [];
    let skippedAbstract = 0;

    if (existsSync(nodesDir) && existsSync(indexPath)) {
        const indexText = readFileSync(indexPath, "utf8");
        const indexSf = ts.createSourceFile(indexPath, indexText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        const defaultImports = new Map(); // localName -> module specifier
        ts.forEachChild(indexSf, (node) => {
            if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
                const spec = node.moduleSpecifier.text;
                const clause = node.importClause;
                if (clause && clause.name && /(^|\/)lib\/nodes\//.test(spec)) {
                    defaultImports.set(clause.name.text, spec);
                }
            }
        });

        const catalogArgs = new Set(); // identifiers passed to `new Catalog(...)`
        (function visit(node) {
            if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Catalog") {
                for (const arg of node.arguments ?? []) {
                    if (ts.isIdentifier(arg)) catalogArgs.add(arg.text);
                }
            }
            ts.forEachChild(node, visit);
        })(indexSf);

        let tsFiles = listNodeTsFiles(nodesDir);
        if (nodeFilter) tsFiles = tsFiles.filter((f) => basename(f) === `${nodeFilter}.ts`);
        for (const tsFile of tsFiles) {
            const cls = defaultExportClass(join(nodesDir, tsFile));
            if (!cls) {
                problems.push(`${tsFile} -> no default-exported class found`);
                continue;
            }
            if (cls.isAbstract) {
                skippedAbstract++;
                continue;
            }
            const className = cls.name;
            const isImported = [...defaultImports.keys()].includes(className);
            const isRegistered = catalogArgs.has(className);
            if (!isImported || !isRegistered) {
                problems.push(`${tsFile} (class ${className}) -> imported in index.ts: ${isImported}, passed to Catalog(...): ${isRegistered}`);
            }
        }
    } else {
        problems.push("lib/nodes or index.ts not found");
    }

    record(
        "registration",
        `lib/nodes classes registered in index.ts${nodeFilter ? ` (filtered to ${nodeFilter})` : ""}${skippedAbstract ? ` (${skippedNote(skippedAbstract).slice(2)})` : ""}`,
        problems.length === 0 ? "PASS" : "FAIL",
        problems.join("\n")
    );
}

// --- 6. changelog.json top entry has a valid semver version ------------------
if (shouldRun("changelog")) {
    const changelogPath = join(repoRoot, "changelog.json");
    const semverRe =
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    if (!existsSync(changelogPath)) {
        record("changelog", "changelog.json top version is valid semver", "FAIL", "changelog.json not found");
    } else {
        try {
            const changelog = JSON.parse(readFileSync(changelogPath, "utf8"));
            const top = Array.isArray(changelog) ? changelog[0] : null;
            const version = top?.version;
            const ok = typeof version === "string" && semverRe.test(version);
            record("changelog", "changelog.json top version is valid semver", ok ? "PASS" : "FAIL", `version: ${JSON.stringify(version)}`);
        } catch (err) {
            record("changelog", "changelog.json top version is valid semver", "FAIL", `could not parse JSON: ${err.message}`);
        }
    }
}

// --- Report --------------------------------------------------------------------
const failed = results.filter((r) => r.status === "FAIL");
const verdict = failed.length === 0 ? `PASS (${results.length} checks, 0 failed)` : `FAIL (${failed.length}/${results.length} checks failed)`;

if (jsonOutput) {
    console.log(JSON.stringify({ repoRoot, results, ok: failed.length === 0, verdict }, null, 2));
} else {
    const nameWidth = Math.max(...results.map((r) => r.name.length));
    console.log(`Catalog verification — repo: ${repoRoot}`);
    console.log("=".repeat(nameWidth + 10));
    for (const r of results) {
        console.log(`[${r.status.padEnd(4)}] ${r.name.padEnd(nameWidth)}`);
        if (r.detail) {
            for (const line of r.detail.split("\n")) console.log(`         ${line}`);
        }
    }
    console.log("=".repeat(nameWidth + 10));
    console.log(`VERDICT: ${verdict}`);
}

// Exit code = number of failed checks capped at 1 (non-zero on any failure,
// but never used as a literal failure COUNT for shell `$?` semantics).
process.exit(Math.min(failed.length, 1));
