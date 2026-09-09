/**
 * create-high5-nodes/boolean-default-required
 *
 * Every input of `type: StreamNodeSpecificationInputType.BOOLEAN` must declare
 * a `defaultValue`. Stream Designer renders a BOOLEAN input as a checkbox,
 * which has no "unset" state — leaving `defaultValue` off means the engine
 * resolves the input to `undefined` with no way for the user to tell "I
 * deliberately left it" from "I forgot". See references/input-type-rules.md
 * ("BOOLEAN") for the full rationale.
 */
import { isIoArrayElementProperty } from "./lib/spec-ast.mjs";

function isBooleanTypeValue(node) {
    return (
        node &&
        node.type === "MemberExpression" &&
        !node.computed &&
        node.object.type === "Identifier" &&
        node.object.name === "StreamNodeSpecificationInputType" &&
        node.property.type === "Identifier" &&
        node.property.name === "BOOLEAN"
    );
}

function hasDefaultValueProperty(objectExpression) {
    return objectExpression.properties.some((prop) => {
        if (prop.type !== "Property" || prop.computed) return false;
        const keyName = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
        return keyName === "defaultValue";
    });
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "[boolean-default-required] every BOOLEAN input must declare a defaultValue",
        },
        schema: [],
        messages: {
            missingDefaultValue:
                "[boolean-default-required] BOOLEAN input is missing a required 'defaultValue' — checkboxes have no unset state.",
        },
    },
    create(context) {
        return {
            "Property[key.name='type']"(node) {
                if (!isBooleanTypeValue(node.value)) return;
                const inputObject = node.parent;
                if (inputObject.type !== "ObjectExpression") return;
                if (!isIoArrayElementProperty(node)) return; // scoped: only inputs[] elements
                if (!hasDefaultValueProperty(inputObject)) {
                    context.report({ node: inputObject, messageId: "missingDefaultValue" });
                }
            },
        };
    },
};
