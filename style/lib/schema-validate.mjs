// A hand-rolled validator for the small subset of JSON Schema (draft 2020-12)
// that style/rules.schema.json actually uses. No ajv, no external deps — this
// skill has to run against whatever the catalog repo's own node_modules
// happens to contain, and a schema library isn't a safe assumption.
//
// Supported keywords: type, enum, const, required, properties,
// additionalProperties (boolean form only), pattern, minLength, maxLength,
// minimum, minItems, maxItems, items, $ref (resolved against the root
// document's $defs), if/then (only the "properties.<key>.const" shape used
// here). Anything else in a schema is silently ignored — this is not a
// general-purpose validator, just enough to check our own schema file.
//
// Returns an array of human-readable error strings; empty means valid.

function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "number" && Number.isInteger(value)) return "integer";
    return typeof value;
}

function matchesType(value, expected) {
    if (expected === "integer") {
        return typeof value === "number" && Number.isInteger(value);
    }
    if (expected === "number") {
        return typeof value === "number";
    }
    return typeOf(value) === expected || (expected === "number" && typeOf(value) === "integer");
}

function resolveRef(ref, root) {
    // Only supports the local "#/$defs/<name>" shape used by our schema.
    const match = /^#\/\$defs\/(.+)$/.exec(ref);
    if (!match) {
        throw new Error(`Unsupported $ref shape: ${ref}`);
    }
    const def = root.$defs?.[match[1]];
    if (!def) {
        throw new Error(`$ref target not found: ${ref}`);
    }
    return def;
}

export function validate(data, schema, root = schema, path = "$") {
    const errors = [];

    if (schema.$ref) {
        return validate(data, resolveRef(schema.$ref, root), root, path);
    }

    if (schema.type && !matchesType(data, schema.type)) {
        errors.push(`${path}: expected type "${schema.type}", got "${typeOf(data)}"`);
        return errors; // further checks would be noise once the base type is wrong
    }

    if (schema.enum && !schema.enum.includes(data)) {
        errors.push(`${path}: value ${JSON.stringify(data)} is not one of ${JSON.stringify(schema.enum)}`);
    }

    if (schema.const !== undefined && data !== schema.const) {
        errors.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`);
    }

    if (typeof data === "string") {
        if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
            errors.push(`${path}: "${data}" does not match pattern ${schema.pattern}`);
        }
        if (schema.minLength !== undefined && data.length < schema.minLength) {
            errors.push(`${path}: length ${data.length} is below minLength ${schema.minLength}`);
        }
        if (schema.maxLength !== undefined && data.length > schema.maxLength) {
            errors.push(`${path}: length ${data.length} exceeds maxLength ${schema.maxLength}`);
        }
    }

    if (typeof data === "number" && schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${path}: ${data} is below minimum ${schema.minimum}`);
    }

    if (Array.isArray(data)) {
        if (schema.minItems !== undefined && data.length < schema.minItems) {
            errors.push(`${path}: has ${data.length} items, below minItems ${schema.minItems}`);
        }
        if (schema.maxItems !== undefined && data.length > schema.maxItems) {
            errors.push(`${path}: has ${data.length} items, exceeds maxItems ${schema.maxItems}`);
        }
        if (schema.items) {
            data.forEach((item, i) => {
                errors.push(...validate(item, schema.items, root, `${path}[${i}]`));
            });
        }
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
        if (schema.required) {
            for (const key of schema.required) {
                if (!Object.prototype.hasOwnProperty.call(data, key)) {
                    errors.push(`${path}: missing required property "${key}"`);
                }
            }
        }
        if (schema.properties) {
            for (const [key, subSchema] of Object.entries(schema.properties)) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    errors.push(...validate(data[key], subSchema, root, `${path}.${key}`));
                }
            }
        }
        if (schema.additionalProperties === false) {
            const allowed = new Set(Object.keys(schema.properties ?? {}));
            for (const key of Object.keys(data)) {
                if (!allowed.has(key)) {
                    errors.push(`${path}: unexpected property "${key}" (additionalProperties: false)`);
                }
            }
        }
        if (schema.if && schema.then) {
            const ifErrors = validate(data, schema.if, root, path);
            if (ifErrors.length === 0) {
                errors.push(...validate(data, schema.then, root, path));
            }
        }
    }

    return errors;
}
