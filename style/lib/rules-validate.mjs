// Full validation of style/rules.json: schema shape (via schema-validate.mjs)
// plus the structural invariants a JSON Schema can't express on its own —
// unique ids, `lintRule === id`, every engine rule is non-overridable, and
// the two-way correspondence between rules.json's `enforcedBy: "lint"`
// entries and the actual files under lint/rules/.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validate as validateAgainstSchema } from "./schema-validate.mjs";

/**
 * @param {object} rulesManifest - parsed style/rules.json
 * @param {object} schema - parsed style/rules.schema.json
 * @param {{ lintRulesDir: string, lintIndexPath: string }} paths - absolute paths
 * @returns {Promise<string[]>} problems; empty means the manifest is valid
 */
export async function validateRules(rulesManifest, schema, { lintRulesDir, lintIndexPath }) {
    const problems = [];

    // 1. Schema shape.
    problems.push(...validateAgainstSchema(rulesManifest, schema).map((e) => `schema: ${e}`));

    if (!Array.isArray(rulesManifest.rules)) {
        // Schema validation above already reported this; nothing further to check.
        return problems;
    }

    // 2. Unique ids.
    const seen = new Map();
    for (const rule of rulesManifest.rules) {
        if (typeof rule.id !== "string") continue;
        if (seen.has(rule.id)) {
            problems.push(`duplicate rule id "${rule.id}" (also declared earlier in the array)`);
        }
        seen.set(rule.id, rule);
    }

    // 3. Per-rule structural checks not expressible in JSON Schema.
    for (const rule of rulesManifest.rules) {
        if (typeof rule.id !== "string") continue;

        if (rule.class === "engine" && rule.overridable !== false) {
            problems.push(`rule "${rule.id}": class is "engine" but overridable is not false`);
        }

        if (rule.enforcedBy === "lint") {
            if (rule.lintRule !== rule.id) {
                problems.push(
                    `rule "${rule.id}": enforcedBy is "lint" but lintRule ("${rule.lintRule}") does not equal id`
                );
            }
        } else if (rule.lintRule !== undefined) {
            problems.push(`rule "${rule.id}": lintRule is set but enforcedBy is "${rule.enforcedBy}", not "lint"`);
        }
    }

    // 4. Every enforcedBy:lint rule has a lint/rules/<id>.mjs file, and is
    //    registered in lint/rules/index.mjs under that same id.
    let indexModule;
    try {
        indexModule = (await import(pathToFileURL(lintIndexPath).href)).default;
    } catch (err) {
        problems.push(`could not load ${lintIndexPath}: ${err.message}`);
        indexModule = null;
    }
    const registeredIds = new Set(Object.keys(indexModule?.rules ?? {}));

    const lintRuleIdsInManifest = new Set(
        rulesManifest.rules.filter((r) => r.enforcedBy === "lint" && typeof r.id === "string").map((r) => r.id)
    );

    for (const id of lintRuleIdsInManifest) {
        const filePath = join(lintRulesDir, `${id}.mjs`);
        if (!existsSync(filePath)) {
            problems.push(`rule "${id}" has enforcedBy: "lint" but lint/rules/${id}.mjs does not exist`);
        }
        if (!registeredIds.has(id)) {
            problems.push(`rule "${id}" has enforcedBy: "lint" but is not registered in lint/rules/index.mjs`);
        }
    }

    // 5. The reverse direction — every file actually registered in
    //    lint/rules/index.mjs corresponds to a rules.json entry.
    for (const id of registeredIds) {
        if (!lintRuleIdsInManifest.has(id)) {
            problems.push(`lint/rules/index.mjs registers "${id}" but style/rules.json has no matching enforcedBy:"lint" entry`);
        }
    }

    return problems;
}
