#!/usr/bin/env node
// RuleTester-based test suite for the create-high5-nodes lint rules. Uses the
// REPO's own installed `eslint` (for RuleTester) and `typescript-eslint` (for
// the parser) — nothing bundled with the skill. Run from inside the catalog
// repo:
//
//   node .agents/skills/create-high5-nodes/lint/test/run.mjs
//
// Exits non-zero if any rule's test suite fails.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findRepoRoot, loadFromRepo } from "../../scripts/lib/repo-root.mjs";

import sentenceCaseNames from "../rules/sentence-case-names.mjs";
import noTrailingPeriodDescription from "../rules/no-trailing-period-description.mjs";
import exampleRequired from "../rules/example-required.mjs";
import booleanDefaultRequired from "../rules/boolean-default-required.mjs";
import curlOutputLast from "../rules/curl-output-last.mjs";
import noClassSelfReference from "../rules/no-class-self-reference.mjs";
import totalCountOutputName from "../rules/total-count-output-name.mjs";

import { computeEffective } from "../../style/lib/overrides.mjs";
import { ruleEntry } from "../../style/lib/rule-entry.mjs";

const repoRoot = findRepoRoot(import.meta.url);
const eslintModule = await loadFromRepo(import.meta.url, repoRoot, "eslint");
const { RuleTester } = eslintModule;
const tseslintModule = await loadFromRepo(import.meta.url, repoRoot, "typescript-eslint");
const tseslint = tseslintModule.default ?? tseslintModule;

const ruleTester = new RuleTester({
    languageOptions: {
        parser: tseslint.parser,
        parserOptions: { sourceType: "module" },
    },
});

const suites = [];
function suite(name, rule, tests) {
    suites.push({ name, rule, tests });
}

// ---------------------------------------------------------------------------
// sentence-case-names
// ---------------------------------------------------------------------------
suite("sentence-case-names", sentenceCaseNames, {
    valid: [
        // literal spec name, sentence case
        `class Foo { specification = { name: "Create ticket", category: "Tickets", inputs: [], outputs: [] }; }`,
        // enum-referenced input name, sentence case value
        `enum Input { TASK_ID = "Task id" }
         class Foo { specification = { name: "Create ticket", inputs: [ { name: Input.TASK_ID, description: "d", example: "e" } ], outputs: [] }; }`,
        // digit-containing word exempt from lowercase check
        `class Foo { specification = { name: "Fail on non-2xx", inputs: [], outputs: [] }; }`,
        // pure-digit word exempt (e.g. an option key "2xx")
        `class Foo { specification = { inputs: [ { name: "Method", options: { "2xx": "2xx" } } ], outputs: [] }; }`,
        // helmut.cloud exact-token exemption
        `class Foo { specification = { category: "helmut.cloud", inputs: [], outputs: [] }; }`,
        // STRING_SELECT option keys, sentence case (two words)
        `class Foo { specification = { inputs: [ { name: "Method", options: { "Get": "GET", "In progress": "in-progress" } } ], outputs: [] }; }`,
        // author.name is NOT a spec/io name and must not be checked
        `class Foo { specification = { name: "Create ticket", author: { name: "not sentence case AT ALL" }, inputs: [], outputs: [] }; }`,
        // allow-listed exact string passes even though not sentence case
        {
            code: `class Foo { specification = { name: "OAuth token", inputs: [], outputs: [] }; }`,
            options: [{ allow: ["OAuth token"] }],
        },
    ],
    invalid: [
        {
            code: `class Foo { specification = { name: "Task ID", inputs: [], outputs: [] }; }`,
            errors: [{ messageId: "notSentenceCase" }],
        },
        {
            code: `class Foo { specification = { name: "API Key", inputs: [], outputs: [] }; }`,
            errors: [{ messageId: "notSentenceCase" }],
        },
        {
            code: `class Foo { specification = { name: "Create Ticket", inputs: [], outputs: [] }; }`,
            errors: [{ messageId: "notSentenceCase" }],
        },
        {
            // enum-reference form: violation must be reported AT the enum member
            // declaration (line 1), not at the usage site (line 2).
            code:
                `enum Input { TASK_ID = "Task ID" }\n` +
                `class Foo { specification = { inputs: [ { name: Input.TASK_ID, description: "d", example: "e" } ], outputs: [] }; }`,
            errors: [{ messageId: "notSentenceCase", line: 1 }],
        },
        {
            code: `class Foo { specification = { category: "Customer Accounts", inputs: [], outputs: [] }; }`,
            errors: [{ messageId: "notSentenceCase" }],
        },
        {
            code: `class Foo { specification = { inputs: [ { name: "Method", options: { "In Progress": "in-progress" } } ], outputs: [] }; }`,
            errors: [{ messageId: "notSentenceCase" }],
        },
    ],
});

// ---------------------------------------------------------------------------
// no-trailing-period-description
// ---------------------------------------------------------------------------
suite("no-trailing-period-description", noTrailingPeriodDescription, {
    valid: [
        `class Foo { specification = { description: "Sends a request", inputs: [], outputs: [] }; }`,
        // outside `specification` entirely — must not be checked
        `const other = { description: "Ends with a period." };`,
    ],
    invalid: [
        {
            code: `class Foo { specification = { description: "Sends a request.", inputs: [], outputs: [] }; }`,
            errors: [{ messageId: "trailingPunctuation" }],
        },
        {
            code: `class Foo { specification = { inputs: [ { name: "X", description: "Do this!", example: "e" } ], outputs: [] }; }`,
            errors: [{ messageId: "trailingPunctuation" }],
        },
        {
            code: `class Foo { specification = { additionalConnectors: [ { name: "Item", description: "Fires per item?" } ], inputs: [], outputs: [] }; }`,
            errors: [{ messageId: "trailingPunctuation" }],
        },
    ],
});

// ---------------------------------------------------------------------------
// example-required
// ---------------------------------------------------------------------------
suite("example-required", exampleRequired, {
    valid: [
        `class Foo { specification = { inputs: [ { name: "X", example: "e" } ], outputs: [ { name: "Y", example: "f" } ] }; }`,
    ],
    invalid: [
        {
            code: `class Foo { specification = { inputs: [ { name: "X" } ], outputs: [] }; }`,
            errors: [{ messageId: "missingExample" }],
        },
        {
            code: `class Foo { specification = { inputs: [], outputs: [ { name: "Y" } ] }; }`,
            errors: [{ messageId: "missingExample" }],
        },
    ],
});

// ---------------------------------------------------------------------------
// boolean-default-required
// ---------------------------------------------------------------------------
suite("boolean-default-required", booleanDefaultRequired, {
    valid: [
        `class Foo { specification = { inputs: [ { name: "X", type: StreamNodeSpecificationInputType.BOOLEAN, example: false, defaultValue: false } ], outputs: [] }; }`,
        // non-boolean input without defaultValue must not trigger
        `class Foo { specification = { inputs: [ { name: "X", type: StreamNodeSpecificationInputType.STRING, example: "e" } ], outputs: [] }; }`,
    ],
    invalid: [
        {
            code: `class Foo { specification = { inputs: [ { name: "X", type: StreamNodeSpecificationInputType.BOOLEAN, example: false } ], outputs: [] }; }`,
            errors: [{ messageId: "missingDefaultValue" }],
        },
    ],
});

// ---------------------------------------------------------------------------
// curl-output-last
// ---------------------------------------------------------------------------
suite("curl-output-last", curlOutputLast, {
    valid: [
        `class Foo { specification = { inputs: [], outputs: [ { name: "Status code", example: 200 }, { name: "Curl", example: "curl ..." } ] }; }`,
        `class Foo { specification = { inputs: [], outputs: [ { name: "Status code", example: 200 } ] }; }`,
        // enum-reference form, Curl last
        `enum Output { STATUS = "Status code", CURL = "Curl" }
         class Foo { specification = { inputs: [], outputs: [ { name: Output.STATUS, example: 200 }, { name: Output.CURL, example: "curl ..." } ] }; }`,
    ],
    invalid: [
        {
            code: `class Foo { specification = { inputs: [], outputs: [ { name: "Curl", example: "curl ..." }, { name: "Status code", example: 200 } ] }; }`,
            errors: [{ messageId: "curlNotLast" }],
        },
        {
            code:
                `enum Output { CURL = "Curl", STATUS = "Status code" }\n` +
                `class Foo { specification = { inputs: [], outputs: [ { name: Output.CURL, example: "curl ..." }, { name: Output.STATUS, example: 200 } ] }; }`,
            errors: [{ messageId: "curlNotLast" }],
        },
    ],
});

// ---------------------------------------------------------------------------
// no-class-self-reference
// ---------------------------------------------------------------------------
suite("no-class-self-reference", noClassSelfReference, {
    valid: [
        // module-level function, no self-reference at all
        `function parseId(raw) { return raw.trim(); }
         class Foo { execute() { return parseId(this.raw); } }`,
        // instance method via `this` — the house-style recommended fix
        `class Foo {
            parseId(raw) { return raw.trim(); }
            execute() { return this.parseId(this.raw); }
         }`,
        // this.constructor — the other sanctioned escape hatch
        `class Foo { execute() { return this.constructor.name; } }`,
        // reference OUTSIDE the class body entirely — module-level export, a test file's `new Foo()`
        `class Foo {}
         export default Foo;
         const instance = new Foo();`,
        // a method literally named the same as the class is a declaration site, not a reference
        `class Foo { Foo() { return 1; } }`,
        // non-computed property access on some OTHER object named the same as the class — not a self-reference
        `class Foo { execute(x) { return x.Foo; } }`,
        // a TypeScript type position (erased at compile time, invisible to esbuild's runtime rename)
        `class Foo { method(): Foo { return this; } }`,
    ],
    invalid: [
        // static helper called by the class's own name
        {
            code: `class Foo {
                static helper() { return 1; }
                execute() { return Foo.helper(); }
            }`,
            errors: [{ messageId: "selfReference" }],
        },
        // instanceof
        {
            code: `class Foo { execute(x) { return x instanceof Foo; } }`,
            errors: [{ messageId: "selfReference" }],
        },
        // new inside the class's own body
        {
            code: `class Foo { execute() { return new Foo(); } }`,
            errors: [{ messageId: "selfReference" }],
        },
        // typeof
        {
            code: `class Foo { execute(x) { return typeof Foo; } }`,
            errors: [{ messageId: "selfReference" }],
        },
        // bare reference to a static constant by class name
        {
            code: `class Foo {
                static CONSTANT = 1;
                execute() { return Foo.CONSTANT; }
            }`,
            errors: [{ messageId: "selfReference" }],
        },
    ],
});

// ---------------------------------------------------------------------------
// total-count-output-name
// ---------------------------------------------------------------------------
suite("total-count-output-name", totalCountOutputName, {
    valid: [
        // correctly named count output
        `class Foo { specification = { inputs: [], outputs: [ { name: "Total count", example: 3 } ] }; }`,
        // enum-referenced correct name
        `enum Output { TOTAL_COUNT = "Total count" }
         class Foo { specification = { inputs: [], outputs: [ { name: Output.TOTAL_COUNT, example: 3 } ] }; }`,
        // "<Entity> count" on an INPUT, not an output — must not trigger
        `class Foo { specification = { inputs: [ { name: "Secret count", example: 3 } ], outputs: [] }; }`,
        // unrelated output name
        `class Foo { specification = { inputs: [], outputs: [ { name: "Task id", example: "abc" } ] }; }`,
        // allow-listed exact string passes even though it matches the pattern
        {
            code: `class Foo { specification = { inputs: [], outputs: [ { name: "Secret count", example: 3 } ] }; }`,
            options: [{ allow: ["Secret count"] }],
        },
    ],
    invalid: [
        {
            code: `class Foo { specification = { inputs: [], outputs: [ { name: "Secret count", example: 3 } ] }; }`,
            errors: [{ messageId: "wrongCountName" }],
        },
        {
            code: `class Foo { specification = { inputs: [], outputs: [ { name: "Project count", example: 3 } ] }; }`,
            errors: [{ messageId: "wrongCountName" }],
        },
        {
            // enum-reference form: violation must be reported AT the enum member
            // declaration (line 1), not at the usage site (line 2).
            code:
                `enum Output { WORKSPACE_COUNT = "Workspace count" }\n` +
                `class Foo { specification = { inputs: [], outputs: [ { name: Output.WORKSPACE_COUNT, example: 3 } ] }; }`,
            errors: [{ messageId: "wrongCountName", line: 1 }],
        },
    ],
});

// ---------------------------------------------------------------------------
// House-style overrides (style/lib/overrides.mjs + style/lib/rule-entry.mjs)
// ---------------------------------------------------------------------------
// These exercise the SAME functions lint/eslint.config.mjs calls to turn
// style/rules.json + create-high5-nodes.config.json into ESLint rule entries —
// not a parallel reimplementation — so a pass here is a real guarantee about
// what the config file does with a given overrides file.
const rulesManifest = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../style/rules.json", import.meta.url)), "utf8")
);

const overrideChecks = [];
function checkOverride(name, fn) {
    overrideChecks.push({ name, fn });
}

checkOverride("override false disables a house-style rule", () => {
    const effective = computeEffective(rulesManifest, {
        overrides: { "no-trailing-period-description": false },
    });
    const effectiveById = new Map(effective.rules.map((r) => [r.id, r]));
    const entry = ruleEntry(effectiveById, "no-trailing-period-description", "warn");
    if (entry !== "off") {
        throw new Error(`expected "off", got ${JSON.stringify(entry)}`);
    }
    if (effective.errors.length !== 0) {
        throw new Error(`expected no errors for a valid house-style override, got ${JSON.stringify(effective.errors)}`);
    }
});

checkOverride("override on an engine rule is ignored — rule still fires", () => {
    const effective = computeEffective(rulesManifest, {
        overrides: { "example-required": false },
    });
    const effectiveById = new Map(effective.rules.map((r) => [r.id, r]));
    const entry = ruleEntry(effectiveById, "example-required", "error");
    if (entry !== "error") {
        throw new Error(`expected "error" (override ignored), got ${JSON.stringify(entry)}`);
    }
    if (!effective.errors.some((e) => e.includes('engine rule "example-required"'))) {
        throw new Error(`expected an "engine rule ignored" error, got ${JSON.stringify(effective.errors)}`);
    }
});

checkOverride("an object override's 'allow' passes through as rule options", () => {
    const effective = computeEffective(rulesManifest, {
        overrides: { "sentence-case-names": { allow: ["OAuth token"] } },
    });
    const effectiveById = new Map(effective.rules.map((r) => [r.id, r]));
    const entry = ruleEntry(effectiveById, "sentence-case-names", "warn");
    if (!Array.isArray(entry) || entry[0] !== "warn" || !entry[1]?.allow?.includes("OAuth token")) {
        throw new Error(`expected ["warn", { allow: ["OAuth token"] }], got ${JSON.stringify(entry)}`);
    }
});

checkOverride("an unknown rule id in overrides is reported as an error", () => {
    const effective = computeEffective(rulesManifest, {
        overrides: { "no-such-rule": false },
    });
    if (!effective.errors.some((e) => e.includes('Unknown rule id "no-such-rule"'))) {
        throw new Error(`expected an "unknown rule id" error, got ${JSON.stringify(effective.errors)}`);
    }
});

// ---------------------------------------------------------------------------
// Run everything, collect pass/fail per suite, exit non-zero on any failure.
// ---------------------------------------------------------------------------
let failures = 0;
for (const { name, rule, tests } of suites) {
    try {
        ruleTester.run(name, rule, tests);
        console.log(`[PASS] ${name} (${tests.valid.length} valid, ${tests.invalid.length} invalid)`);
    } catch (err) {
        failures++;
        console.log(`[FAIL] ${name}`);
        console.log(
            (err && err.message ? err.message : String(err))
                .split("\n")
                .map((l) => `         ${l}`)
                .join("\n")
        );
    }
}

for (const { name, fn } of overrideChecks) {
    try {
        fn();
        console.log(`[PASS] override: ${name}`);
    } catch (err) {
        failures++;
        console.log(`[FAIL] override: ${name}`);
        console.log(`         ${err && err.message ? err.message : String(err)}`);
    }
}

const totalChecks = suites.length + overrideChecks.length;
console.log("=".repeat(40));
console.log(failures === 0 ? `VERDICT: PASS (${totalChecks} checks)` : `VERDICT: FAIL (${failures}/${totalChecks} checks failed)`);

process.exit(failures === 0 ? 0 : 1);
