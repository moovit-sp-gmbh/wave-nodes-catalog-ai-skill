#!/usr/bin/env node
// Reads FACTS out of the repo's own installed node_modules/wave-engine and
// node_modules/hcloud-sdk (never anything hand-maintained by the skill) and
// prints them as markdown. Uses the repo's own installed `typescript` package
// to parse the .d.ts files with a real AST instead of regex-scraping
// declaration text. Read-only — writes nothing except the optional --out file,
// which is the caller's own requested output, never anything inside the repo.
//
// Answers: "what can the skill GENERATE from the installed packages, vs what
// must it hand-write/curate (rules of thumb, house style, etc)?"
//
// Usage: node scripts/engine-surface.mjs [--out <file>]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { findRepoRoot, loadFromRepo } from "./lib/repo-root.mjs";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outFile = outIndex !== -1 ? args[outIndex + 1] : null;

const repoRoot = findRepoRoot(import.meta.url);
const waveEngineDir = join(repoRoot, "node_modules/wave-engine");
const hcloudSdkDir = join(repoRoot, "node_modules/hcloud-sdk");
const ts = (await loadFromRepo(import.meta.url, repoRoot, "typescript")).default;

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

function parseDts(absPath) {
    const text = readFileSync(absPath, "utf8");
    return ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function hasPrivateOrProtected(member) {
    const mods = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    if (!mods) return false;
    return mods.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword);
}

/** @returns {Map<string, string[]>} className -> array of "methodSignature();" lines */
function extractPublicClassMethods(sourceFile) {
    const classes = new Map();
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isClassDeclaration(node) || !node.name) return;
        const methods = [];
        for (const member of node.members) {
            const isMethod = ts.isMethodDeclaration(member) || ts.isMethodSignature(member);
            if (!isMethod || hasPrivateOrProtected(member)) continue;
            methods.push(member.getText(sourceFile).trim());
        }
        classes.set(node.name.text, methods);
    });
    return classes;
}

function extractEnumMembers(sourceFile, enumName) {
    let members = null;
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isEnumDeclaration(node) && node.name.text === enumName) {
            members = node.members.map((m) => m.getText(sourceFile).trim());
        }
    });
    return members;
}

function extractInterfaceNamesMatching(sourceFile, prefix) {
    // Matches both `interface Foo` (V1, V2 here) AND `type Foo = ...` (V3 here is
    // a computed type alias: `Omit<V2, "specVersion"> & {...}`, not its own
    // interface) — a generator that only looked for InterfaceDeclaration would
    // silently miss V3.
    const names = [];
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text.startsWith(prefix)) {
            names.push({ name: node.name.text, kind: "interface", node });
        } else if (ts.isTypeAliasDeclaration(node) && node.name.text.startsWith(prefix)) {
            names.push({ name: node.name.text, kind: "type alias", node, definition: node.type.getText(sourceFile) });
        }
    });
    return names;
}

function extractInterfaceMemberSignatures(sourceFile, interfaceName) {
    let sigs = null;
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
            sigs = node.members.map((m) => m.getText(sourceFile).trim());
        }
    });
    return sigs;
}

/** Field name out of a member signature like `specVersion: 3;` or `tag?: X[];`. */
function fieldNameOf(signature) {
    return signature.split(":")[0].replace("?", "").trim();
}

/**
 * For a type alias shaped `Omit<Base, "field"> & { added: T; ... }` (the
 * StreamNodeSpecificationV3 pattern), returns the base interface's fields
 * (minus the omitted one(s)) plus the added fields, so the caller doesn't
 * have to hand-maintain "V3 = V2 + deprecated" as a comment that can drift.
 * Returns null if `typeNode` isn't shaped that way.
 */
function describeOmitAndExtendType(sourceFile, typeNode) {
    if (!ts.isIntersectionTypeNode(typeNode)) return null;
    let omitInfo = null;
    let addedMembers = [];
    for (const member of typeNode.types) {
        if (ts.isTypeReferenceNode(member) && member.typeName.getText(sourceFile) === "Omit" && member.typeArguments?.length === 2) {
            const baseName = member.typeArguments[0].getText(sourceFile);
            const omittedArg = member.typeArguments[1];
            let omitted = [];
            if (ts.isLiteralTypeNode(omittedArg) && ts.isStringLiteral(omittedArg.literal)) {
                omitted = [omittedArg.literal.text];
            } else if (ts.isUnionTypeNode(omittedArg)) {
                omitted = omittedArg.types.filter((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)).map((t) => t.literal.text);
            }
            omitInfo = { baseName, omitted };
        } else if (ts.isTypeLiteralNode(member)) {
            addedMembers = member.members.map((m) => m.getText(sourceFile).trim());
        }
    }
    if (!omitInfo) return null;
    const baseFields = extractInterfaceMemberSignatures(sourceFile, omitInfo.baseName) || [];
    const keptBaseFields = baseFields.filter((sig) => !omitInfo.omitted.includes(fieldNameOf(sig)));
    return { baseName: omitInfo.baseName, omitted: omitInfo.omitted, keptBaseFields, addedMembers };
}

/** Walk a package dir (skipping its own node_modules) looking for a literal substring. */
function grepPackage(dir, needle, { caseInsensitive = false } = {}) {
    const hits = [];
    const target = caseInsensitive ? needle.toLowerCase() : needle;
    function walk(current) {
        for (const entry of readdirSync(current)) {
            if (entry === "node_modules") continue; // that's a sub-dependency, not the package's own code
            const full = join(current, entry);
            const st = statSync(full);
            if (st.isDirectory()) {
                walk(full);
            } else if (/\.(d\.ts|ts|js|json|md)$/.test(entry)) {
                const text = readFileSync(full, "utf8");
                const haystack = caseInsensitive ? text.toLowerCase() : text;
                if (haystack.includes(target)) {
                    const lineNum = haystack.slice(0, haystack.indexOf(target)).split("\n").length;
                    const line = text.split("\n")[lineNum - 1].trim();
                    hits.push({ file: relative(dir, full), line: lineNum, snippet: line.slice(0, 160) });
                }
            }
        }
    }
    walk(dir);
    return hits;
}

const out = [];
const p = (s = "") => out.push(s);

const waveEngineVersion = readJson(join(waveEngineDir, "package.json")).version;
const hcloudSdkVersion = readJson(join(hcloudSdkDir, "package.json")).version;

p("# Engine surface (generated facts)");
p();
p(`Generated from wave-engine ${waveEngineVersion} / hcloud-sdk ${hcloudSdkVersion} on ${new Date().toISOString()}`);
p();
p(`Repo root: \`${repoRoot}\``);
p();

// --- Wave.d.ts public API --------------------------------------------------
const waveDtsPath = join(waveEngineDir, "helpers/Wave.d.ts");
p("## `wave-engine/helpers/Wave.d.ts` — helper classes and public method signatures");
p();
if (existsSync(waveDtsPath)) {
    const sf = parseDts(waveDtsPath);
    const classes = extractPublicClassMethods(sf);
    for (const [className, methods] of classes) {
        p(`### ${className}`);
        p();
        if (methods.length === 0) {
            p("_(no public methods — property/constructor only)_");
        } else {
            for (const m of methods) p(`- \`${m}\``);
        }
        p();
    }
} else {
    p("_File not found._");
    p();
}

// --- hcloud-sdk spec types --------------------------------------------------
const hcloudIndexPath = join(hcloudSdkDir, "lib/interfaces/high5/wave/index.d.ts");
p("## `hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`");
p();
let hcloudSf = null;
if (existsSync(hcloudIndexPath)) {
    hcloudSf = parseDts(hcloudIndexPath);

    for (const enumName of ["StreamNodeSpecificationInputType", "StreamNodeSpecificationOutputType"]) {
        const members = extractEnumMembers(hcloudSf, enumName);
        p(`### \`${enumName}\` members`);
        p();
        if (members) {
            for (const m of members) p(`- \`${m}\``);
        } else {
            p("_enum not found_");
        }
        p();
    }

    const specVersionTypes = extractInterfaceNamesMatching(hcloudSf, "StreamNodeSpecificationV");
    p("### `StreamNodeSpecificationV*` versions present");
    p();
    if (specVersionTypes.length) {
        for (const t of specVersionTypes) {
            if (t.kind === "interface") {
                const members = extractInterfaceMemberSignatures(hcloudSf, t.name);
                p(`- \`${t.name}\` (interface; fields: ${members.map(fieldNameOf).join(", ")})`);
            } else {
                const described = describeOmitAndExtendType(hcloudSf, t.node.type);
                if (described) {
                    p(`- \`${t.name}\` (type alias = \`${t.definition.replace(/\s+/g, " ")}\`)`);
                    p(
                        `  - inherited from \`${described.baseName}\` (all fields except ${described.omitted.map((f) => `\`${f}\``).join(", ")}): ${described.keptBaseFields.map(fieldNameOf).join(", ")}`
                    );
                    p(`  - added by this alias: ${described.addedMembers.map(fieldNameOf).join(", ")}`);
                } else {
                    p(`- \`${t.name}\` (type alias = \`${t.definition.replace(/\s+/g, " ")}\`)`);
                }
            }
        }
    } else {
        p("_none found_");
    }
    p();

    const tagMembers = extractEnumMembers(hcloudSf, "StreamNodeSpecificationTag");
    p("### `StreamNodeSpecificationTag` members");
    p();
    if (tagMembers) {
        for (const m of tagMembers) p(`- \`${m}\``);
    } else {
        p("_enum not found_");
    }
    p();
} else {
    p("_File not found._");
    p();
}

// --- wave-engine's duplicate-handling enums ---------------------------------
p("## `wave-engine/models` — duplicate-handling enums");
p();
for (const [label, relPath] of [
    ["DuplicateFileOption", "models/DuplicateFileOptionEnum.d.ts"],
    ["DuplicateFolderOption", "models/DuplicateFolderOptionEnum.d.ts"],
]) {
    const absPath = join(waveEngineDir, relPath);
    p(`### \`${label}\` members`);
    p();
    if (existsSync(absPath)) {
        const sf = parseDts(absPath);
        const members = extractEnumMembers(sf, label);
        if (members) {
            for (const m of members) p(`- \`${m}\``);
        } else {
            p("_enum not found in file_");
        }
    } else {
        p(`_File not found: \`${relPath}\`_`);
    }
    p();
}

// --- Not generatable ---------------------------------------------------------
p("## Not generatable");
p();
p(
    "The wildcard vocabulary (`PAYLOAD`, and the node/stream/agent wildcard variants " +
        "documented in `references/wildcards-and-variables.md`) is **not exported as data** " +
        "by either package — there is no `WildcardRegistry`-shaped JSON and no exported const " +
        "array to read facts from. Evidence, searched across every `.d.ts`/`.ts`/`.js`/`.json`/`.md` " +
        "file under `node_modules/wave-engine` (excluding its own nested `node_modules`):"
);
p();
const wildcardHits = grepPackage(waveEngineDir, "wildcards", { caseInsensitive: true });
const payloadHits = grepPackage(waveEngineDir, "PAYLOAD");
p(`- \`"wildcards"\` matches (case-insensitive): ${wildcardHits.length}`);
for (const h of wildcardHits) p(`  - \`${h.file}:${h.line}\` — \`${h.snippet}\``);
p(`- \`"PAYLOAD"\` matches: ${payloadHits.length}`);
for (const h of payloadHits) p(`  - \`${h.file}:${h.line}\` — \`${h.snippet}\``);
p();
p(
    "**Conclusion:** the only trace is the `WildcardResolver` implementation's private methods " +
        "and a `switch` in its compiled `.js` — this vocabulary has to be hand-documented by the " +
        "skill from reading source, not generated from package metadata."
);
p();

const markdown = out.join("\n");

if (outFile) {
    const dir = dirname(outFile);
    if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outFile, markdown, "utf8");
    console.log(`Wrote engine surface (${markdown.length} bytes) to ${outFile}`);
} else {
    console.log(markdown);
}
