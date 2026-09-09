/**
 * create-high5-nodes/total-count-output-name
 *
 * House-style archetype: a List node's count output has a fixed name, "Total
 * count" (references/naming-and-style.md, "Per-HTTP-method output
 * archetypes"). Eval sweeps have repeatedly shown models instead deriving the
 * name from the entity being listed (`Secret count`, `Project count`,
 * `Workspace count`), which reads plausible but breaks the fixed archetype
 * name workflow engineers expect across every List node in the catalog.
 *
 * Flags any output whose resolved display name matches `<Word> count` (case
 * insensitive) UNLESS that name is exactly "Total count" (case-sensitive
 * match against the correct spelling) or is in the `allow` list.
 *
 * Resolves the output's `name` the same way sentence-case-names does: a
 * string literal, or a reference to a local enum member (`name:
 * Output.SECRET_COUNT`), reporting at the enum member's declaration when
 * that form is used.
 */
import {
    buildEnumIndex,
    resolveNameLike,
    isSpecTopLevelProperty,
    isIoArrayElementProperty,
} from "./lib/spec-ast.mjs";

const WRONG_COUNT_NAME = /^(?!Total count$)[A-Za-z]+ count$/i;

export default {
    meta: {
        type: "problem",
        docs: {
            description:
                '[total-count-output-name] a List node\'s count output must be named "Total count", not "<Entity> count"',
        },
        schema: [
            {
                type: "object",
                properties: {
                    allow: {
                        type: "array",
                        items: { type: "string" },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            wrongCountName:
                '[total-count-output-name] Name the list count output "Total count" (found "{{name}}")',
        },
    },
    create(context) {
        const options = context.options[0] || {};
        const allowList = options.allow || [];
        let enumIndex = new Map();

        return {
            Program(node) {
                enumIndex = buildEnumIndex(node);
            },

            "Property[key.name='name'] > Literal, Property[key.name='name'] > MemberExpression"(node) {
                const property = node.parent;
                if (property.value !== node) return;
                if (!isIoArrayElementProperty(property)) return;
                // Only outputs, not inputs, carry the List count archetype.
                const arrayExpression = property.parent.parent;
                const arrayOwner = arrayExpression.parent;
                if (!arrayOwner || arrayOwner.key.name !== "outputs") return;
                if (!isSpecTopLevelProperty(arrayOwner)) return;

                const resolved = resolveNameLike(node, enumIndex);
                if (!resolved) return;
                if (allowList.includes(resolved.value)) return;
                if (!WRONG_COUNT_NAME.test(resolved.value)) return;

                context.report({
                    node: resolved.reportNode,
                    messageId: "wrongCountName",
                    data: { name: resolved.value },
                });
            },
        };
    },
};
