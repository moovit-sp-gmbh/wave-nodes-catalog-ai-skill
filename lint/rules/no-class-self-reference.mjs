/**
 * create-high5-nodes/no-class-self-reference
 *
 * Inside a node class's own body, never reference the class by its own name —
 * a static helper called as `ClassName.helper()`, `ClassName.CONSTANT`,
 * `instanceof ClassName`, `new ClassName()`, `typeof ClassName`, or a bare
 * value reference. Use a module-level function, an instance method via
 * `this`, or `this.constructor` instead.
 *
 * Why this is an engine-breaking bug, not a style nit (verified against
 * esbuild 0.25.1 and the blueprint's lib/Catalog.ts — step 4 eval runs,
 * reproduced): esbuild rewrites a class that references its own name inside
 * its body into a named class EXPRESSION, `class _ClassName extends Node {
 * ... }` (note the leading underscore). That rewrite changes the runtime
 * `ctor.name` the blueprint reads to key its `Catalog.nodeCatalog[node.name]`
 * registry, so the node silently disappears from the bundle and `npm run
 * spec -- ClassName` throws "is not a constructor". The bug only reproduces
 * through a real bundler pass — nothing at lint time other than "does this
 * identifier appear" can detect it, so this rule flags the pattern outright
 * rather than trying to model esbuild's renaming decision.
 *
 * Scope: only identifiers inside the class's OWN body (between its opening
 * and closing brace, at any nesting depth — methods, arrow functions, static
 * blocks) that resolve to a VALUE reference to the class:
 *   - the class's own `id` (the declaration itself) is exempt
 *   - a non-computed property/method KEY that happens to match the class
 *     name (e.g. a method literally named the same as the class) is exempt —
 *     it's a declaration site, not a reference
 *   - a non-computed MemberExpression PROPERTY (`x.Foo`, reading some other
 *     object's field that happens to be named the same as the class) is
 *     exempt — it isn't a reference to the class at all
 *   - a TypeScript TYPE position (`x: Foo`, `Array<Foo>`, `foo as Foo`,
 *     `): Foo {`) is exempt — types are erased at compile time and never
 *     reach esbuild's runtime class-name rewrite
 * References outside the class body entirely (`export default Foo`, a test
 * file's `new Foo()`) are never visited by this rule in the first place.
 */

function isTypePosition(node) {
    const parent = node.parent;
    return !!parent && parent.type === "TSTypeReference" && parent.typeName === node;
}

function isDeclarationSite(node) {
    const parent = node.parent;
    if (!parent) return false;
    if (parent.type === "ClassDeclaration" && parent.id === node) return true;
    if (parent.type === "FunctionDeclaration" && parent.id === node) return true;
    if (parent.type === "VariableDeclarator" && parent.id === node) return true;
    if (
        (parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") &&
        parent.key === node &&
        !parent.computed
    ) {
        return true;
    }
    if (parent.type === "Property" && parent.key === node && !parent.computed) return true;
    return false;
}

function isNonComputedPropertyAccess(node) {
    const parent = node.parent;
    return !!parent && parent.type === "MemberExpression" && parent.property === node && !parent.computed;
}

export default {
    meta: {
        type: "problem",
        docs: {
            description:
                "[no-class-self-reference] a node class must never reference itself by its own name inside its own body",
        },
        schema: [],
        messages: {
            selfReference:
                "[no-class-self-reference] Class body references its own class name '{{name}}' — esbuild 0.25.1 rewrites a self-referencing class as `class _{{name}}`, changing the runtime constructor name; the blueprint's Catalog keys its registry by that name, so the node silently disappears from the bundle and \"npm run spec\" fails with \"is not a constructor\". Use a module-level function, an instance method via 'this', or 'this.constructor' instead.",
        },
    },
    create(context) {
        const classStack = [];
        return {
            ClassDeclaration(node) {
                classStack.push(node.id ? node : null);
            },
            "ClassDeclaration:exit"() {
                classStack.pop();
            },
            Identifier(node) {
                if (classStack.length === 0) return;
                const enclosingClass = classStack[classStack.length - 1];
                if (!enclosingClass) return;
                const className = enclosingClass.id.name;
                if (node.name !== className) return;
                if (node === enclosingClass.id) return;
                // Exclude anything sitting between `id` and the class body itself
                // (heritage clause, type parameters) — only the body is in scope.
                if (node.range[0] < enclosingClass.body.range[0]) return;
                if (isDeclarationSite(node)) return;
                if (isNonComputedPropertyAccess(node)) return;
                if (isTypePosition(node)) return;
                context.report({ node, messageId: "selfReference", data: { name: className } });
            },
        };
    },
};
