/**
 * create-high5-nodes/example-required
 *
 * Every object literal that is a direct element of an `inputs:` or `outputs:`
 * array inside a node's `specification` class field must have an `example`
 * property. The hcloud-sdk StreamNodeSpecificationInput/Output types already
 * mark `example` as required, so `tsc` would eventually catch a missing
 * `example` on a fully-typed object literal — this rule exists as a second,
 * lint-time signal that fires even while the object is still being typed or
 * assembled in a way `tsc` can't fully narrow.
 */
import { isInsideSpecification } from "./lib/spec-ast.mjs";

function hasExampleProperty(objectExpression) {
    return objectExpression.properties.some((prop) => {
        if (prop.type !== "Property" || prop.computed) return false;
        const keyName = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
        return keyName === "example";
    });
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "[example-required] every inputs/outputs object literal must have an 'example' property",
        },
        schema: [],
        messages: {
            missingExample: "[example-required] Input/output object literal is missing a required 'example' property.",
        },
    },
    create(context) {
        return {
            "Property[key.name='inputs'] > ArrayExpression > ObjectExpression, Property[key.name='outputs'] > ArrayExpression > ObjectExpression"(
                node
            ) {
                const arrayExpression = node.parent;
                const property = arrayExpression.parent;
                if (
                    !property ||
                    property.type !== "Property" ||
                    (property.key.name !== "inputs" && property.key.name !== "outputs") ||
                    property.value !== arrayExpression
                ) {
                    return;
                }
                if (!isInsideSpecification(node)) return;
                if (!hasExampleProperty(node)) {
                    context.report({ node, messageId: "missingExample" });
                }
            },
        };
    },
};
