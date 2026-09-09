# Input coercion — what the engine does before `execute()`

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

When deciding how defensively to parse an input. When debugging why a value arrives different from what the user typed. When designing input types.

## Concept

The engine validates and coerces every input value **before** your `execute()` runs. By the time you call `getInputValueByInputName`, the value is already the type your spec declared. You don't need to call `Number(...)` on a `NUMBER` input or `JSON.parse(...)` on a `STRING_MAP`. The engine did it.

If coercion fails — the value can't be made into the declared type — the engine throws `StreamNodeInputTypeError` (code 502) and your `execute()` never runs.

Source: `node_modules/wave-engine/nodes/Node.js` — search for the `validateInputTypes` method.

## What the engine does per type

| Input type | Coercion rules |
|---|---|
| `STRING`, `STRING_LONG`, `STRING_PASSWORD`, `STRING_READONLY` | Objects → `JSON.stringify`. Numbers/booleans → `String(...)`. Promise detected → error. |
| `NUMBER` | `Number(value)`. If `NaN` → error. |
| `BOOLEAN` | String `"true"`/`"false"` → coerce to boolean. Real booleans pass through. Anything else → error. |
| `STRING_SELECT` | Value must match one of the spec's `options` values exactly. Mismatch → error. |
| `STRING_LIST` | Must be an array. Each element coerced to string (objects stringified, others via `String(...)`). |
| `STRING_MAP` | Either a plain object `{ key: value }` or an array of `{ key, value }`. Keys coerced to string, values coerced to string. Promise in either → error. |
| `ANY` | No validation. Whatever comes in is what you get. |

**Mandatory check** happens first: if a `mandatory: true` input is undefined / null / empty string, `StreamNodeInputMissingError` (code 501) is thrown before any type check.

## What you can rely on

Inside `execute()`, given a spec input of:

| Spec type | You can `as` to |
|---|---|
| `STRING` | `string` |
| `STRING_LONG` | `string` |
| `STRING_PASSWORD` | `string` |
| `STRING_SELECT` | `string` (one of the option values) |
| `STRING_LIST` | `string[]` |
| `STRING_MAP` | `Record<string, string>` |
| `NUMBER` | `number` |
| `BOOLEAN` | `boolean` |
| `ANY` | `unknown` — cast deliberately based on what the input represents |

### When the bare cast is safe — and when it isn't

Cast as the bare type (`as string`, `as boolean`, `as number`, …) when **either** of these holds:

1. **The input is `mandatory: true`.** The engine throws `StreamNodeInputMissingError` (code 501) before `execute()` runs if the value is missing — see `throwForMissingInputValue` in `node_modules/wave-engine/nodes/Node.js`. Your accessor will not see `undefined`.
2. **The input is `BOOLEAN` *and* the house-style `boolean-default-required` lint rule is respected** (every BOOLEAN input in the catalog declares a literal `defaultValue`). This is **not** a compile-time guarantee — the SDK type (`node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`) only discriminates `StreamNodeSpecificationInput` on `STRING_SELECT` vs. everything else; `defaultValue?: any` and `mandatory?: boolean` are both optional for BOOLEAN the same as for every other type. Stream Designer prefills the checkbox from `defaultValue` when it's present, which is why a lint-enforced default is the practical safety net, not the type system. See [`input-type-rules.md#boolean`](./input-type-rules.md#boolean).

**Be cautious with optional non-BOOLEAN inputs that declare a `defaultValue`.** The engine does *not* substitute defaults at runtime — `node_modules/wave-engine/nodes/Node.js` never reads the spec's `defaultValue` field anywhere in `validateInputTypes`, `validateInputMandatories`, or `resolveInputs` `(engine, verified 2.0.1)`. `defaultValue` is a Stream Designer *UI-prefill hint*, not an engine fallback. A user who clears the field, or a programmatically-constructed stream that omits the input, delivers `undefined` to your accessor. For inputs in this category, do one of:

- Cast as `T | undefined` and apply the fallback explicitly at the read site: `(this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) as number | undefined) ?? 30000`.
- Promote to `mandatory: true` if the input is genuinely required.
- Keep `advanced: true` with the `defaultValue`, *and* apply a defensive `?? <literal>` at the read site as belt-and-braces — cheapest robust pattern when the default is a simple literal.

The trap to avoid: writing `as number` on a `mandatory: false` input with `defaultValue: 30000` and assuming the value is always present. The Stream Designer prefill makes this work in the happy path but fails when the user clears the field.

So:

```typescript
const url = this.wave.inputs.getInputValueByInputName(Input.URL) as string;
const timeout = this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) as number;
const headers = this.wave.inputs.getInputValueByInputName(Input.HEADERS) as Record<string, string>;
const tags = this.wave.inputs.getInputValueByInputName(Input.TAGS) as string[];
const followRedirects = this.wave.inputs.getInputValueByInputName(Input.FOLLOW_REDIRECTS) as boolean;
const anything = this.wave.inputs.getInputValueByInputName(Input.PAYLOAD); // unknown
```

## What still requires defensive code

The engine guarantees the *shape*. It does not guarantee the *semantics*. You still need to:

- **Range-check numbers.** A `NUMBER` input might be `-1`, `0`, `Infinity`. If your node expects a positive integer, validate explicitly.
- **Validate string content.** A `STRING` input is just a string. Empty string passes if `mandatory: false`. URL inputs need URL parsing. Email inputs need email parsing.
- **Inspect `ANY` inputs carefully.** No structure guarantees. Use `typeof`/`Array.isArray`/duck typing.
- **Validate `STRING_LIST` non-empty** if your logic requires at least one entry.
- **Validate `STRING_MAP` key formats** if your logic requires specific keys (e.g., HTTP header names).

Example:

```typescript
const timeout = this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) as number;
if (timeout <= 0 || !Number.isInteger(timeout)) {
    throw new Error("Could not start request — timeout must be a positive integer — set Timeout to 1 or higher");
}
```

## Anti-patterns

- **Double-coercion.** `Number(this.wave.inputs.getInputValueByInputName(Input.TIMEOUT))` — the engine already did this. Just `as number`.
- **`JSON.parse` on a `STRING_MAP`.** The engine already parsed it. You'll throw on the second parse.
- **Try/catch around the `getInputValueByInputName` call.** It doesn't throw on shape — the engine already validated and your code path wouldn't have started if shape was wrong.
- **Treating `mandatory: false` as "default to empty".** Engine returns whatever the user/default provides. If `defaultValue` is `undefined`, the value can be `undefined`. Handle that.
- **Ignoring the coercion when designing types.** If your spec says `NUMBER` but you have logic for "if user typed nothing, do X", you can't get there — the engine throws on `NaN` before your code runs. Use `STRING` and parse yourself, or set a `defaultValue` and `mandatory: false`.

## Curiosity hooks

- The engine's coercion code lives in one function: `validateInputTypes`, in `node_modules/wave-engine/nodes/Node.js`. A 10-minute read; it's the source of truth for what the engine actually does.
- Coercion failures throw `StreamNodeInputTypeError` with code 502. These never reach your `execute()` — they fail the node before it runs. To the user, the Fail edge fires with a "type mismatch" message.
- The mandatory check is separate and runs first (code 501). Distinguishing the two helps when debugging: a 501 means a *required* input wasn't provided; a 502 means an input was provided but the wrong type.
