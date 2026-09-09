/**
 * Shared AST helpers for the create-high5-nodes lint rules.
 *
 * All rules operate on a node's `specification: StreamNodeSpecificationV*` class
 * field. Real nodes name their inputs/outputs through a local enum:
 *
 *   enum Input { TASK_ID = "Task id" }
 *   ...
 *   { name: Input.TASK_ID, ... }
 *
 * so a rule that only looks at string Literals would miss almost every real
 * node. `buildEnumIndex` + `resolveNameLike` let a rule resolve either form and
 * report at the right place: a literal reports at the literal itself, an enum
 * reference reports at the enum member's declaration (where the display string
 * actually lives), not at the (unremarkable) usage site.
 */

/**
 * Walks the whole Program body (not the traversal order ESLint visits nodes
 * in) looking for `enum Foo { MEMBER = "value" }` declarations, including ones
 * wrapped in `export enum Foo { ... }`. Because this reads `node.body`
 * directly instead of relying on visitor order, it doesn't matter whether the
 * enum is declared before or after the class that references it.
 *
 * @returns {Map<string, Map<string, {value: string|undefined, node: object}>>}
 *   enumName -> memberName -> { value, node (the TSEnumMember) }
 */
export function buildEnumIndex(programNode) {
    const enums = new Map();

    function visitStatement(node) {
        if (!node) return;
        if (node.type === "TSEnumDeclaration") {
            const members = new Map();
            for (const member of node.members) {
                const memberName = member.id.type === "Identifier" ? member.id.name : member.id.value;
                let value;
                if (
                    member.initializer &&
                    member.initializer.type === "Literal" &&
                    typeof member.initializer.value === "string"
                ) {
                    value = member.initializer.value;
                }
                members.set(memberName, { value, node: member });
            }
            enums.set(node.id.name, members);
        } else if (node.type === "ExportNamedDeclaration" && node.declaration) {
            visitStatement(node.declaration);
        }
    }

    for (const statement of programNode.body) {
        visitStatement(statement);
    }
    return enums;
}

/**
 * Resolves an expression appearing at a `name:`-shaped position to its
 * user-visible string, if possible.
 *
 * - `"Literal string"` -> { value, reportNode: the literal }
 * - `Input.TASK_ID` where `Input` is an enum in the same file, resolved via
 *   `enumIndex` -> { value, reportNode: the enum member declaration }
 * - anything else (computed member access, function calls, wildcards, an
 *   enum member with a non-string/numeric initializer, an unknown
 *   identifier) -> null, meaning "can't resolve statically, don't report"
 *
 * @param {object} node - the AST expression node at the value position
 * @param {Map} enumIndex - result of buildEnumIndex
 * @returns {{value: string, reportNode: object} | null}
 */
export function resolveNameLike(node, enumIndex) {
    if (!node) return null;
    if (node.type === "Literal" && typeof node.value === "string") {
        return { value: node.value, reportNode: node };
    }
    if (
        node.type === "MemberExpression" &&
        !node.computed &&
        node.object.type === "Identifier" &&
        node.property.type === "Identifier"
    ) {
        const members = enumIndex.get(node.object.name);
        if (!members) return null;
        const entry = members.get(node.property.name);
        if (!entry || typeof entry.value !== "string") return null;
        return { value: entry.value, reportNode: entry.node };
    }
    return null;
}

/** True if `node` is lexically inside a class field named `specification`. */
export function isInsideSpecification(node) {
    let current = node.parent;
    while (current) {
        if (current.type === "PropertyDefinition" && current.key && current.key.name === "specification") {
            return true;
        }
        current = current.parent;
    }
    return false;
}

/**
 * True when `propertyNode` (a `Property` AST node, e.g. the `name:` or
 * `category:` property) is a DIRECT property of the specification object
 * itself — `specification: { name: ..., category: ..., ... }` — as opposed to
 * some unrelated nested object that happens to reuse the same key name (e.g.
 * `author: { name: "..." }`).
 */
export function isSpecTopLevelProperty(propertyNode) {
    const container = propertyNode.parent; // ObjectExpression holding the property
    if (!container || container.type !== "ObjectExpression") return false;
    const containerParent = container.parent;
    return (
        containerParent &&
        containerParent.type === "PropertyDefinition" &&
        containerParent.key &&
        containerParent.key.name === "specification" &&
        containerParent.value === container
    );
}

/**
 * True when `propertyNode` is a property of an object literal that is itself
 * a direct element of the specification's `inputs:`/`outputs:` array —
 * `specification: { inputs: [ { name: ... }, ... ] } }`.
 */
export function isIoArrayElementProperty(propertyNode) {
    const ioObject = propertyNode.parent; // ObjectExpression for one input/output entry
    if (!ioObject || ioObject.type !== "ObjectExpression") return false;
    const arrayExpression = ioObject.parent;
    if (!arrayExpression || arrayExpression.type !== "ArrayExpression") return false;
    const arrayOwner = arrayExpression.parent; // Property: inputs: [...] / outputs: [...]
    if (
        !arrayOwner ||
        arrayOwner.type !== "Property" ||
        !arrayOwner.key ||
        (arrayOwner.key.name !== "inputs" && arrayOwner.key.name !== "outputs") ||
        arrayOwner.value !== arrayExpression
    ) {
        return false;
    }
    return isSpecTopLevelProperty(arrayOwner);
}

/**
 * True when `propertyNode` is a key/value pair inside a STRING_SELECT input's
 * `options: { Key: "value", ... }` object, where that input is itself an
 * element of the specification's `inputs:` array.
 */
export function isOptionsEntryOfSpecInput(propertyNode) {
    const optionsObject = propertyNode.parent; // ObjectExpression: the options map
    if (!optionsObject || optionsObject.type !== "ObjectExpression") return false;
    const optionsProperty = optionsObject.parent; // Property: options: {...}
    if (
        !optionsProperty ||
        optionsProperty.type !== "Property" ||
        !optionsProperty.key ||
        optionsProperty.key.name !== "options" ||
        optionsProperty.value !== optionsObject
    ) {
        return false;
    }
    // The input object holding `options:` must be an inputs[] array element.
    return isIoArrayElementProperty(optionsProperty);
}

/** Extracts a property's static key name, whether written as an identifier or a string literal. */
export function staticKeyName(property) {
    if (property.computed) return null;
    if (property.key.type === "Identifier") return property.key.name;
    if (property.key.type === "Literal" && typeof property.key.value === "string") return property.key.value;
    return null;
}
