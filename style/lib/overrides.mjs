// Shared override-resolution logic for style/rules.json.
//
// The user opts out of individual house-style rules by creating ONE file at
// their catalog repo root: `create-high5-nodes.config.json` (the name is not
// hardcoded here — it's read from rules.json's own `overridesFile` field so
// there is exactly one place that name is spelled out).
//
// Shape:
//   { "overrides": { "<rule-id>": false | { "value": ..., "allow": [...] } } }
//
// `false` disables a house-style rule entirely. An object merges its keys
// into the rule's `options` (e.g. `{ "allow": ["Api"] }` extends the
// sentence-case-names allow-list). Engine-class rules can never be
// overridden — an override targeting one is reported as an error and
// ignored; the rule keeps applying.
//
// Both scripts/style.mjs (the `effective` subcommand) and
// lint/eslint.config.mjs import this file so the two never compute two
// different answers to "is rule X on, and with what options".
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads `<repoRoot>/<overridesFileName>` if present.
 *
 * @param {string} repoRoot
 * @param {string} overridesFileName - typically rulesManifest.overridesFile
 * @returns {{ overrides: Record<string, unknown>, path: string, present: boolean }}
 */
export function loadOverridesFile(repoRoot, overridesFileName) {
    const path = join(repoRoot, overridesFileName);
    if (!existsSync(path)) {
        return { overrides: {}, path, present: false };
    }
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
        throw new Error(`Could not parse ${overridesFileName} — ${err.message} — fix the JSON syntax`);
    }
    const overrides = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.overrides ?? {} : {};
    return { overrides, path, present: true };
}

/**
 * Resolves the manifest's rules against a loaded overrides file.
 *
 * @param {object} rulesManifest - parsed style/rules.json
 * @param {{ overrides: Record<string, unknown> }} overridesFile - result of loadOverridesFile
 * @returns {{
 *   rules: Array<{
 *     id: string, class: string, scope: string, statement: string,
 *     enforcedBy: string, lintRule?: string, overridable: boolean,
 *     on: boolean, effectiveOptions: object, overrideApplied: boolean,
 *   }>,
 *   errors: string[],
 * }}
 */
export function computeEffective(rulesManifest, overridesFile) {
    const overrides = overridesFile.overrides ?? {};
    const errors = [];
    const ruleIds = new Set(rulesManifest.rules.map((r) => r.id));

    const rules = rulesManifest.rules.map((rule) => {
        const raw = Object.prototype.hasOwnProperty.call(overrides, rule.id) ? overrides[rule.id] : undefined;
        let on = true;
        let effectiveOptions = rule.options ? { ...rule.options } : {};
        let overrideApplied = false;

        if (raw !== undefined) {
            if (rule.class === "engine") {
                errors.push(
                    `Override on engine rule "${rule.id}" is not allowed and was ignored — engine rules are never overridable`
                );
                // on/effectiveOptions unchanged — the rule keeps applying as-is.
            } else if (raw === false) {
                on = false;
                overrideApplied = true;
            } else if (raw && typeof raw === "object") {
                effectiveOptions = { ...effectiveOptions, ...raw };
                overrideApplied = true;
            } else {
                errors.push(
                    `Override for rule "${rule.id}" is neither 'false' nor an object — ignoring (value: ${JSON.stringify(raw)})`
                );
            }
        }

        return {
            id: rule.id,
            class: rule.class,
            scope: rule.scope,
            statement: rule.statement,
            enforcedBy: rule.enforcedBy,
            lintRule: rule.lintRule,
            overridable: rule.overridable,
            on,
            effectiveOptions,
            overrideApplied,
        };
    });

    for (const key of Object.keys(overrides)) {
        if (!ruleIds.has(key)) {
            errors.push(`Unknown rule id "${key}" in overrides — no rule with that id exists in style/rules.json`);
        }
    }

    return { rules, errors };
}

/** Count of overrides that actually changed something (excludes ignored engine-rule overrides and unknown ids). */
export function countActiveOverrides(effective) {
    return effective.rules.filter((r) => r.overrideApplied).length;
}
