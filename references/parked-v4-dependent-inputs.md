# Parked: specVersion 4 and dependent (conditional) inputs

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

> **Parked.** The engine version the blueprint installs (wave-engine 2.0.1) executes spec versions 1 to 3 only and hcloud-sdk 16.0.0 has no V4 type. Do not author V4 nodes until the engine team confirms a release that runs them. Kept here so the material is not lost.

This file used to live split across `references/specification.md`, `references/input-type-rules.md`, and a bullet in `SKILL.md` Step 5. It's consolidated here because none of it is currently actionable — `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts` only exports `StreamNodeSpecificationV1`, `StreamNodeSpecificationV2`, and `StreamNodeSpecificationV3` (there is no `StreamNodeSpecificationV4` export, and no `dependentInputs.d.ts` file anywhere under `node_modules/hcloud-sdk/`), and `node_modules/wave-engine/nodes/Node.js` only special-cases `isStreamNodeSpecificationV1/V2/V3` wherever it branches on spec version.

## What to do instead, today

When you need an input to appear only under specific conditions (e.g., "Bearer token" shows only when "Auth type" is "Bearer"), there is no engine-level conditional-visibility mechanism available. Two house-style substitutes:

1. **State the condition in the input's `description`** — e.g. `"Enter the bearer token for the target API (used when Auth type is 'bearer')"` — so the workflow engineer understands when the field matters even though Stream Designer shows it unconditionally.
2. **Validate presence inside `execute()`** when the branch that needs the value is actually taken, and throw a three-part error (see `references/errors.md`) if it's missing:

```typescript
if (authType === "bearer") {
    const token = this.wave.inputs.getInputValueByInputName(Input.BEARER_TOKEN) as string | undefined;
    if (!token) {
        throw new Error(
            "Could not authenticate — Bearer token is required when Auth type is 'bearer' — fill in the Bearer token field",
        );
    }
    headers.Authorization = `Bearer ${token}`;
}
```

Leave the conditionally-needed input `mandatory: false` (or omit `mandatory`) — there is no DSL to make it conditionally mandatory, so marking it `mandatory: true` would make the engine demand it on every run regardless of branch, per `references/input-type-rules.md`'s mandatory-validator behavior below.

The worked example that used to demonstrate this — `references/parked/conditional-input-node.ts` — is kept for reference only; it does not compile against the installed hcloud-sdk.

## The historical V4 material (kept for when V4 ships)

### Pick a spec version — the V4 row

| Version | When to use |
|---|---|
| **V4** | Use when you need *conditional input visibility* — inputs that show only when other inputs hold specific values. Adds the `if: Query<T>` field to each input. |

**Why not V4 by default (even once it exists):** the `if: Query<T>` DSL is powerful but adds complexity to the spec and to the user's mental model. Most nodes don't need it — `advanced: true` on rarely-used inputs covers the same ergonomic territory.

### V4 dependent inputs (`if` Query DSL)

When you need an input to appear only under specific conditions (e.g., "Bearer token" input shows only when "Auth type" is "Bearer"):

```typescript
specification: StreamNodeSpecificationV4 = {
    specVersion: 4,
    // ...,
    inputs: [
        {
            name: "Auth type",
            type: StreamNodeSpecificationInputType.STRING_SELECT,
            options: { None: "none", Bearer: "bearer", Basic: "basic" },
            example: "bearer",
            mandatory: true,
        },
        {
            name: "Bearer token",
            type: StreamNodeSpecificationInputType.STRING_PASSWORD,
            example: "eyJhbGciOiJIUzI1NiIs…",
            mandatory: true,
            if: { "Auth type": "bearer" },   // shows only when Auth type = bearer
        },
    ],
}
```

The `if` value would be a MongoDB-style query with operators such as `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$contains`, `$startsWith`, `$endsWith`, `$regex`, `$in`, `$nin`, `$exists`, `$type`, `$and`, `$or`, `$nor`, `$not` — this is drawn from an earlier design note, not from a shipped type, so treat the exact operator list as unconfirmed until a `dependentInputs.d.ts` actually ships.

Example with operators:

```typescript
if: { country: "US", age: { $gte: 18 } }
if: { $or: [{ tier: "pro" }, { tier: "enterprise" }] }
```

### Never combine `if:` with `mandatory: true`

**The rule.** Never combine `if:` with `mandatory: true` on the same input. Conditional inputs declared with the V4 `if:` predicate should omit `mandatory` (or set it `false`) and be validated *inside `execute()`* when the branch that needs them is taken.

**Why.** The wave-engine's mandatory validator (`validateInputMandatories` in `node_modules/wave-engine/nodes/Node.js`) iterates every declared input unconditionally and throws `StreamNodeInputMissingError` whenever `mandatory: true` and the resolved value is empty. It does not evaluate an `if` field — there is no such handling anywhere in that file `(engine, verified 2.0.1)`. A conditional-visibility field, once it ships, would presumably be consumed by Stream Designer to hide/show inputs in the UI, with no runtime effect on the mandatory check.

Concretely: if you have three mutually-exclusive conditional inputs each marked `mandatory: true`, the user fills exactly one of them, and the engine would then throw `StreamNodeInputMissingError` on the other two — for fields the UI never showed. The node fails before `execute()` runs.

**Canonical shape (for when V4 ships):**

```typescript
// Spec — conditional input, no `mandatory`
{
    name: Input.BEARER_TOKEN,
    description: "Enter the bearer token for the target API",
    type: StreamNodeSpecificationInputType.STRING_PASSWORD,
    example: "eyJhbGciOiJIUzI1NiIs",
    if: { [Input.AUTH_TYPE]: "bearer" },
}

// execute() — presence check when the branch is taken
if (authType === "bearer") {
    const token = this.wave.inputs.getInputValueByInputName(Input.BEARER_TOKEN) as string | undefined;
    if (!token) {
        throw new Error(
            "Could not authenticate — Bearer token is required when Auth type is 'bearer' — fill in the Bearer token field",
        );
    }
    headers.Authorization = `Bearer ${token}`;
}
```

The TS accessor is `as string | undefined` (the input may legitimately be absent — see `references/input-coercion.md`'s "When the bare cast is safe" rules). The `if (!token)` check is a presence guard with a three-part error message (see `references/errors.md`).
