#!/usr/bin/env node
// Verifies the repo this skill just attached to actually looks like a working
// wave catalog, before any other script (verify.mjs, engine-surface.mjs)
// trusts it. Locates the repo root by walking up from this file's own
// location (see lib/repo-root.mjs) so it works no matter where the skill was
// installed or what directory it was invoked from. Reads only — never writes
// anything in the repo.
//
// Usage: node scripts/check-env.mjs [--json]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "./lib/repo-root.mjs";

const jsonOutput = process.argv.includes("--json");

const checks = [];
/** status: "PASS" | "WARN" | "FAIL" */
function record(label, status, detail = "") {
    checks.push({ label, status, detail });
}

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

/** Minimal semver-range satisfaction check for the handful of range shapes
 * package.json actually uses here (^x.y.z, ~x.y.z, exact x.y.z). Returns
 * true/false, or null if the range shape isn't one we understand (in which
 * case the caller should treat it as informational, not a hard mismatch). */
function satisfiesRange(range, version) {
    const v = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
    if (!v) return null;
    const installed = { major: +v[1], minor: +v[2], patch: +v[3] };

    const trimmed = String(range).trim();
    let m;
    if ((m = /^\^(\d+)\.(\d+)\.(\d+)/.exec(trimmed))) {
        const base = { major: +m[1], minor: +m[2], patch: +m[3] };
        if (base.major > 0) {
            return (
                installed.major === base.major &&
                (installed.minor > base.minor || (installed.minor === base.minor && installed.patch >= base.patch))
            );
        }
        return installed.major === 0 && installed.minor === base.minor && installed.patch >= base.patch;
    }
    if ((m = /^~(\d+)\.(\d+)\.(\d+)/.exec(trimmed))) {
        const base = { major: +m[1], minor: +m[2], patch: +m[3] };
        return installed.major === base.major && installed.minor === base.minor && installed.patch >= base.patch;
    }
    if ((m = /^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed))) {
        return installed.major === +m[1] && installed.minor === +m[2] && installed.patch === +m[3];
    }
    return null;
}

function declaredRange(pkg, depName) {
    return pkg.dependencies?.[depName] ?? pkg.devDependencies?.[depName] ?? null;
}

function checkPackageVersion(repoRoot, pkg, depName) {
    const range = declaredRange(pkg, depName);
    const installedPkgPath = join(repoRoot, "node_modules", depName, "package.json");
    if (!existsSync(installedPkgPath)) {
        record(`${depName} installed`, "FAIL", `not found under node_modules (declared range: ${range ?? "none"})`);
        return;
    }
    const installedVersion = readJson(installedPkgPath).version;
    if (!range) {
        record(`${depName} installed version`, "WARN", `installed ${installedVersion}, not declared in package.json`);
        return;
    }
    const ok = satisfiesRange(range, installedVersion);
    if (ok === true) {
        record(`${depName} installed version`, "PASS", `${installedVersion} satisfies ${range}`);
    } else if (ok === false) {
        record(`${depName} installed version`, "WARN", `installed ${installedVersion} does not satisfy declared range ${range}`);
    } else {
        record(`${depName} installed version`, "WARN", `installed ${installedVersion}, declared range ${range} (unrecognized range shape, not verified)`);
    }
}

// --- locate repo root --------------------------------------------------------
let repoRoot;
try {
    repoRoot = findRepoRoot(import.meta.url);
    record("locate repo root (walking up from this script)", "PASS", repoRoot);
} catch (err) {
    record("locate repo root (walking up from this script)", "FAIL", err.message);
    printAndExit();
}

// --- node version -------------------------------------------------------------
{
    const major = Number(process.version.replace(/^v/, "").split(".")[0]);
    record("node version", major >= 20 ? "PASS" : "WARN", `${process.version}${major < 20 ? " (skill expects >= 20)" : ""}`);
}

// --- node_modules present at all ---------------------------------------------
const nodeModulesPresent = existsSync(join(repoRoot, "node_modules"));
record("node_modules present", nodeModulesPresent ? "PASS" : "FAIL", nodeModulesPresent ? "" : "run `npm install` in the repo root");

if (nodeModulesPresent) {
    const pkg = readJson(join(repoRoot, "package.json"));
    checkPackageVersion(repoRoot, pkg, "wave-engine");
    checkPackageVersion(repoRoot, pkg, "hcloud-sdk");

    for (const rel of ["node_modules/wave-engine/helpers/Wave.d.ts"]) {
        const p = join(repoRoot, rel);
        record(rel, existsSync(p) ? "PASS" : "FAIL", existsSync(p) ? "" : "not found");
    }

    {
        const dts = join(repoRoot, "node_modules/wave-engine/nodes/Node.d.ts");
        const js = join(repoRoot, "node_modules/wave-engine/nodes/Node.js");
        if (existsSync(dts)) record("node_modules/wave-engine/nodes/Node.d.ts (or .js)", "PASS", "found (.d.ts)");
        else if (existsSync(js)) record("node_modules/wave-engine/nodes/Node.d.ts (or .js)", "PASS", "found (.js only)");
        else record("node_modules/wave-engine/nodes/Node.d.ts (or .js)", "FAIL", "not found");
    }

    {
        const p = join(repoRoot, "node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts");
        record("node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts", existsSync(p) ? "PASS" : "FAIL", existsSync(p) ? "" : "not found");
    }
} else {
    record("wave-engine / hcloud-sdk / .d.ts presence", "FAIL", "skipped — node_modules missing, run npm install first");
}

// --- repo-authored files ------------------------------------------------------
// These are load-bearing for verify.mjs's other checks (index.ts/changelog.json
// registration + versioning checks, lib/Node.ts + lib/Catalog.ts as the base
// classes every node extends) so a miss FAILs the environment check. Only
// tsconfig.lib.json (below) is a soft WARN, since verify.mjs already falls
// back to tsconfig.json when it's absent.
for (const rel of ["lib/Node.ts", "lib/Catalog.ts", "index.ts", "changelog.json"]) {
    const p = join(repoRoot, rel);
    record(rel, existsSync(p) ? "PASS" : "FAIL", existsSync(p) ? "" : "not found");
}
{
    const p = join(repoRoot, "tsconfig.lib.json");
    // Explicitly a WARN, not a FAIL: verify.mjs falls back to tsconfig.json
    // when this is missing, so its absence doesn't block anything else here.
    record("tsconfig.lib.json", existsSync(p) ? "PASS" : "WARN", existsSync(p) ? "" : "not found — verify.mjs will fall back to tsconfig.json");
}

printAndExit();

function printAndExit() {
    const hasFail = checks.some((c) => c.status === "FAIL");
    const verdict = hasFail
        ? "VERDICT: environment NOT OK — see FAIL rows above."
        : `VERDICT: environment OK — wave-engine catalog repo at ${repoRoot ?? "(unknown)"}.`;

    if (jsonOutput) {
        console.log(JSON.stringify({ repoRoot: repoRoot ?? null, checks, ok: !hasFail, verdict }, null, 2));
    } else {
        const width = Math.max(...checks.map((c) => c.label.length));
        console.log("Environment check");
        console.log("=".repeat(width + 20));
        for (const c of checks) {
            console.log(`[${c.status.padEnd(4)}] ${c.label.padEnd(width)}  ${c.detail}`);
        }
        console.log("=".repeat(width + 20));
        console.log(verdict);
    }
    process.exit(hasFail ? 1 : 0);
}
