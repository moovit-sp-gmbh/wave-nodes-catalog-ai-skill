/**
 * create-high5-nodes/no-trailing-period-description
 *
 * Every `description` string literal nested inside a node's `specification`
 * class field — the spec's own description, and every input/output/
 * additionalConnectors entry's description — must not end with `.`, `!` or
 * `?`. helmut.cloud UI copy convention: descriptions read as label fragments,
 * not full sentences with terminal punctuation.
 */
import { isInsideSpecification } from "./lib/spec-ast.mjs";

export default {
    meta: {
        type: "problem",
        docs: {
            description:
                "[no-trailing-period-description] 'description' string literals inside specification must not end with . ! or ?",
        },
        schema: [],
        messages: {
            trailingPunctuation: '[no-trailing-period-description] Description must not end with "{{punct}}": "{{value}}"',
        },
    },
    create(context) {
        return {
            "Property[key.name='description'] > Literal"(node) {
                if (typeof node.value !== "string") return;
                const property = node.parent;
                if (property.key.name !== "description" || property.value !== node) return;
                if (!isInsideSpecification(node)) return;
                const trimmed = node.value.trim();
                const lastChar = trimmed.slice(-1);
                if (lastChar === "." || lastChar === "!" || lastChar === "?") {
                    context.report({
                        node,
                        messageId: "trailingPunctuation",
                        data: { punct: lastChar, value: node.value },
                    });
                }
            },
        };
    },
};
