/**
 * create-high5-nodes/curl-output-last
 *
 * If a node declares an output named "Curl" (house-style convention for HTTP-
 * calling nodes: expose the equivalent curl command for debugging), it must
 * be the LAST element of the `outputs` array — every other output should be
 * visible above it in the Stream Designer output list before the debug aid.
 *
 * Resolves the output's `name` the same way sentence-case-names does: a
 * string literal, or a reference to a local enum member (`name:
 * Output.CURL`), so this fires whether or not the node names its outputs
 * through an enum.
 */
import { buildEnumIndex, resolveNameLike, isSpecTopLevelProperty, staticKeyName } from "./lib/spec-ast.mjs";

function findNameValue(entryObject, enumIndex) {
    for (const prop of entryObject.properties) {
        if (prop.type === "Property" && !prop.computed && staticKeyName(prop) === "name") {
            return resolveNameLike(prop.value, enumIndex);
        }
    }
    return null;
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "[curl-output-last] an output named 'Curl' must be the last element of outputs",
        },
        schema: [],
        messages: {
            curlNotLast: "[curl-output-last] The 'Curl' output must be the last element of the outputs array.",
        },
    },
    create(context) {
        let enumIndex = new Map();
        return {
            Program(node) {
                enumIndex = buildEnumIndex(node);
            },
            "Property[key.name='outputs'] > ArrayExpression"(arrayExpression) {
                const outputsProperty = arrayExpression.parent;
                if (!isSpecTopLevelProperty(outputsProperty)) return;

                const entries = arrayExpression.elements.filter((el) => el && el.type === "ObjectExpression");
                let curlIndex = -1;
                entries.forEach((entry, index) => {
                    const resolved = findNameValue(entry, enumIndex);
                    if (resolved && resolved.value === "Curl") {
                        curlIndex = index;
                    }
                });
                if (curlIndex !== -1 && curlIndex !== entries.length - 1) {
                    context.report({ node: entries[curlIndex], messageId: "curlNotLast" });
                }
            },
        };
    },
};
