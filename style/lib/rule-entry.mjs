// Shared by lint/eslint.config.mjs and lint/test/run.mjs so the config file
// and its own test suite compute the exact same answer to "given the
// effective rule set, what ESLint severity/options does rule <id> get".
// Keeping this in one place means a test against `ruleEntry` is a test
// against what eslint.config.mjs actually does, not a parallel reimplementation.

/**
 * @param {Map<string, object>} effectiveById - id -> entry from computeEffective(...).rules
 * @param {string} id - rule id (equal to the lintRule name)
 * @param {"warn"|"error"} defaultSeverity - severity when the rule is on and carries no extra options
 * @returns {"off" | "warn" | "error" | ["warn"|"error", object]}
 */
export function ruleEntry(effectiveById, id, defaultSeverity) {
    const effectiveRule = effectiveById.get(id);
    // Engine-class rules (or an id somehow missing from the manifest) always
    // run at their configured severity — overrides can't touch them.
    if (!effectiveRule || effectiveRule.class === "engine") {
        return defaultSeverity;
    }
    if (!effectiveRule.on) {
        return "off";
    }
    const hasOptions = effectiveRule.effectiveOptions && Object.keys(effectiveRule.effectiveOptions).length > 0;
    return hasOptions ? [defaultSeverity, effectiveRule.effectiveOptions] : defaultSeverity;
}
