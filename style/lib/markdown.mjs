// Deterministic markdown generator for references/house-style.md, driven
// entirely by style/rules.json. No timestamps, no non-deterministic
// ordering — `scripts/style.mjs generate --check` diffs this output against
// the committed file, so two runs against the same rules.json must produce
// byte-identical text.

function optionsCell(rule) {
    if (!rule.options || Object.keys(rule.options).length === 0) return "—";
    return `\`${JSON.stringify(rule.options)}\``;
}

function enforcedByCell(rule) {
    return rule.enforcedBy === "lint" ? `lint (\`${rule.lintRule}\`)` : rule.enforcedBy;
}

function table(rules) {
    const lines = [];
    lines.push("| Id | Rule | Scope | Enforced by | Options | Where |");
    lines.push("|---|---|---|---|---|---|");
    for (const rule of rules) {
        lines.push(
            `| \`${rule.id}\` | ${rule.title} | ${rule.scope} | ${enforcedByCell(rule)} | ${optionsCell(rule)} | \`${rule.source}\` |`
        );
    }
    return lines.join("\n");
}

function optionsLine(rule) {
    return `- \`${rule.id}\`: \`${JSON.stringify(rule.options)}\``;
}

/**
 * @param {object} rulesManifest - parsed style/rules.json
 * @returns {string} the full markdown document, no trailing-newline surprises
 *   (ends with exactly one newline).
 */
export function generateMarkdown(rulesManifest) {
    const engineRules = rulesManifest.rules.filter((r) => r.class === "engine");
    const houseRules = rulesManifest.rules.filter((r) => r.class === "house-style");
    const allRules = [...engineRules, ...houseRules];
    const rulesWithOptions = allRules.filter((r) => r.options && Object.keys(r.options).length > 0);
    const rulesWithoutSource = allRules.filter((r) => !r.source);

    const out = [];
    out.push("Generated from style/rules.json — do not edit by hand; run `scripts/style.mjs generate`");
    out.push("");
    out.push(`# House style`);
    out.push("");
    out.push(rulesManifest.stance);
    out.push("");
    out.push(
        `An override for a house-style rule lives in one file the user creates at their catalog root: \`${rulesManifest.overridesFile}\`. Engine rules cannot be overridden.`
    );
    out.push("");
    out.push(
        "This file is an index only. The \"Where\" column points to the reference file and section that carries the rationale and code examples for each rule — read the rule's `source` before applying or disputing it."
    );
    out.push("");
    out.push("## Engine rules (always apply)");
    out.push("");
    out.push(table(engineRules));
    out.push("");
    out.push("## House style (prescriptive target, overridable)");
    out.push("");
    out.push(table(houseRules));

    if (rulesWithOptions.length > 0) {
        out.push("");
        out.push("## Overridable options");
        out.push("");
        out.push(`Set these under the matching rule id in \`${rulesManifest.overridesFile}\`.`);
        out.push("");
        for (const rule of rulesWithOptions) {
            out.push(optionsLine(rule));
        }
    }

    if (rulesWithoutSource.length > 0) {
        out.push("");
        out.push("## Rules with no prose home");
        out.push("");
        out.push("These rules have no `source` yet in style/rules.json — statement only, until a prose home is found.");
        out.push("");
        for (const rule of rulesWithoutSource) {
            out.push(`- \`${rule.id}\`: ${rule.statement}`);
        }
    }

    // Exactly one trailing newline, no trailing whitespace lines.
    return out.join("\n").replace(/\n+$/, "\n");
}
