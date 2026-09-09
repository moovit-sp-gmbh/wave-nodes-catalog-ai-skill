/**
 * create-high5-nodes/sentence-case-names
 *
 * Enforces house-style sentence case on every user-visible label in a node's
 * `specification`:
 *   - the spec's own `name` (the node's display name)
 *   - every input/output entry's `name`
 *   - the spec's `category`
 *   - every STRING_SELECT input's `options` keys (the dropdown labels; the
 *     option VALUES are wire-format strings for the target API and are
 *     intentionally not checked)
 *
 * Real nodes name inputs/outputs through a local enum and reference the
 * member (`name: Input.TASK_ID`) rather than writing the string inline. This
 * rule resolves that form via the enum's initializer and reports at the enum
 * member's own declaration, since that's where the offending string actually
 * lives — the usage site carries no useful location information.
 *
 * `category` and `options` keys are always written as literals in practice
 * (the hcloud-sdk types don't support enum-keyed option maps in a useful way),
 * but are resolved through the same helper for consistency and so a
 * deliberately-unusual `[Category.FOO]: "bar"` computed key still gets
 * checked.
 */
import { isSentenceCase } from "./lib/sentence-case.mjs";
import {
    buildEnumIndex,
    resolveNameLike,
    isSpecTopLevelProperty,
    isIoArrayElementProperty,
    isOptionsEntryOfSpecInput,
} from "./lib/spec-ast.mjs";

export default {
    meta: {
        type: "problem",
        docs: {
            description:
                "[sentence-case-names] input/output/spec 'name', 'category', and STRING_SELECT option keys must be sentence case",
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
            notSentenceCase:
                '[sentence-case-names] {{field}} "{{value}}" is not sentence case: first character uppercase, every later word lowercase (digits and "helmut.cloud" exempt).',
        },
    },
    create(context) {
        const options = context.options[0] || {};
        const allowList = options.allow || [];
        let enumIndex = new Map();

        function check(resolved, field) {
            if (!resolved) return;
            if (!isSentenceCase(resolved.value, allowList)) {
                context.report({
                    node: resolved.reportNode,
                    messageId: "notSentenceCase",
                    data: { field, value: resolved.value },
                });
            }
        }

        return {
            Program(node) {
                enumIndex = buildEnumIndex(node);
            },

            // specification: { name: "...", category: "...", ... }
            // and specification: { inputs/outputs: [ { name: "..." }, ... ] }
            "Property[key.name='name'] > Literal, Property[key.name='name'] > MemberExpression"(node) {
                const property = node.parent;
                if (property.value !== node) return;
                if (isSpecTopLevelProperty(property) || isIoArrayElementProperty(property)) {
                    check(resolveNameLike(node, enumIndex), "name");
                }
            },

            "Property[key.name='category'] > Literal, Property[key.name='category'] > MemberExpression"(node) {
                const property = node.parent;
                if (property.value !== node) return;
                if (isSpecTopLevelProperty(property)) {
                    check(resolveNameLike(node, enumIndex), "category");
                }
            },

            // options: { SomeKey: "wire-value", ... } — check the keys only.
            "Property[key.name='options'] > ObjectExpression > Property"(node) {
                if (!isOptionsEntryOfSpecInput(node)) return;
                if (node.computed) {
                    // e.g. [Input.SOME_KEY]: "value" — resolve like a name reference.
                    check(resolveNameLike(node.key, enumIndex), "option key");
                    return;
                }
                if (node.key.type === "Identifier") {
                    check({ value: node.key.name, reportNode: node.key }, "option key");
                } else if (node.key.type === "Literal" && typeof node.key.value === "string") {
                    check({ value: node.key.value, reportNode: node.key }, "option key");
                }
            },
        };
    },
};
