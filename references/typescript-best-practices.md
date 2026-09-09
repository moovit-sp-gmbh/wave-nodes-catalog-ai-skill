# TypeScript best practices `[House style — override if user prefers]`

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Any time you're writing or modifying TypeScript code in a node. Especially when you're tempted by `any`, when you're casting with `as` past obvious type guards, or when you're designing a function signature.

## Approach: principles + grounding

This file is short on purpose. The goal isn't to bake a 2026-vintage TypeScript style guide into the skill — TypeScript moves fast, and the best practices age. Instead:

1. **Internalize the principles below** (they're stable).
2. **Ground from authoritative sources** when working on non-trivial type-level code or modern features.

Authoritative sources to fetch as needed:

- The TypeScript handbook: `https://www.typescriptlang.org/docs/handbook/intro.html`
- Release notes for the version you're working with (currently TypeScript `^5.8.3` in the blueprint's `package.json` — check `node_modules/typescript/package.json` for what's actually installed): `https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html`
- `typescript-eslint` recommended config notes: `https://typescript-eslint.io/users/configs`
- For specific pattern questions, search the handbook first; then `typescriptlang.org/play` to sanity-check.

## Stable principles

### Strictness is the default

The blueprint's `tsconfig.json` has `"strict": true`. Don't relax it. Specifically:

- `noImplicitAny` — every variable and parameter has a type, inferred or declared.
- `strictNullChecks` — `undefined` and `null` are explicit. If a value can be missing, the type should say so.
- `strictFunctionTypes`, `strictBindCallApply` — function types are checked carefully.
- `noImplicitThis` — `this` must be explicit when ambiguous.

If a file would compile only with strict off, that's a code smell, not a strict-off opportunity.

### Identifier casing

- **`lowerCamelCase`** — variables (local and module-level `const` references to runtime values), parameters, functions, methods, object property keys.
- **`PascalCase`** — classes, types, interfaces, enums (the enum *itself*), the node's exported class.
- **`UPPER_CASE_WITH_UNDERSCORES`** — enum *keys* (`enum Input { AUTHORIZATION_TOKEN = "Authorization token" }` — identifier `SCREAMING_SNAKE`, string value sentence case per `naming-and-style.md`) and module-level compile-time constants (`const DEFAULT_TIMEOUT_MS = 30_000`). Use snake-shouting only when the value is a true invariant fixed at module load; locals declared `const` inside a function are still `lowerCamelCase`.

`Input` and `Output` enum keys are always UPPER_SNAKE; the *string values* on the right of `=` are Stream Designer's human-facing labels and follow the rules in `naming-and-style.md`.

### No `any` in public surfaces

A node's public surface is its inputs/outputs/spec. None of those should be typed `any`. Internally — in private helpers — `any` is occasionally justified for narrow pragmatic reasons (parsing JSON-y blobs you'll immediately validate), but `unknown` + a type guard is usually better.

### Narrow with type guards, not casts

```typescript
// Worse: cast and pray
const status = (err as { response: { status: number } }).response.status;

// Better: check, then use
function hasStatus(err: unknown): err is { response: { status: number } } {
    return typeof err === "object" && err !== null && "response" in err
        && typeof (err as any).response === "object" && (err as any).response !== null
        && "status" in (err as any).response
        && typeof (err as any).response.status === "number";
}

if (hasStatus(err)) {
    const status = err.response.status;  // typed as number
}
```

For shorter cases, `instanceof Error` is a clean guard:

```typescript
if (err instanceof Error) {
    throw new Error(`Request failed — ${err.message} — check the server`);
}
```

### `satisfies` over `as` for literals

When you're writing a literal and want to confirm it conforms to a type *without widening it*, use `satisfies`:

```typescript
// Worse: cast — loses the literal type
const spec = {
    inputs: [{ name: "URL" as const, type: "STRING" }],
} as StreamNodeSpecificationV3;

// Better: satisfies — keeps the literal type
const spec = {
    inputs: [{ name: "URL", type: "STRING" }],
} satisfies StreamNodeSpecificationV3;
```

For inline node specifications, the type-annotation pattern (`specification: StreamNodeSpecificationV3 = { ... }`) is the default. `satisfies` is for cases where you need the narrower inferred type to flow through.

### Node.js builtin imports use the `node:` prefix `[House style]`

Import every Node.js builtin module via its explicit `node:` specifier — never the bare name. `node:` is supported on every Node version the engine targets (≥ 16), is explicit-by-design, and avoids the future risk of an npm package shadowing the builtin name.

```typescript
// Worse — bare builtin name
import { createHash } from "crypto";
import { readFile }   from "fs/promises";
import path           from "path";

// Better — explicit node: prefix
import { createHash } from "node:crypto";
import { readFile }   from "node:fs/promises";
import path           from "node:path";
```

Apply to `node:crypto`, `node:fs`, `node:fs/promises`, `node:path`, `node:os`, `node:url`, `node:util`, `node:stream`, `node:child_process`, etc. Third-party packages (`axios`, `hcloud-sdk`, …) keep their bare names — the `node:` prefix is for the Node standard library only.

For safe usage of `node:child_process` and `execa`, see `shell-injection-and-process-execution.md` — the import is the easy part; the hard part is not passing wildcard-resolved input into a shell.

### `as const` for tuple-like and option literals

```typescript
const Methods = ["GET", "POST", "PUT", "DELETE"] as const;
type Method = (typeof Methods)[number];  // "GET" | "POST" | "PUT" | "DELETE"
```

Useful for `STRING_SELECT` `options` if you want to reuse the option values as a TS union elsewhere in the file.

### Discriminated unions over flag booleans

```typescript
// Worse: two booleans you have to keep consistent
type AuthConfig = {
    isBearer: boolean;
    isBasic: boolean;
    token?: string;
    username?: string;
    password?: string;
};

// Better: a tag and exhaustive options
type AuthConfig =
    | { kind: "bearer"; token: string }
    | { kind: "basic"; username: string; password: string }
    | { kind: "none" };
```

The compiler can then check that you've handled every variant with an exhaustive `switch`.

### Type `async` returns explicitly when the function is exported

```typescript
// Worse: relying on inference for a public method
async function fetchUser(id: string) {
    return await client.users.get(id);
}

// Better: explicit
async function fetchUser(id: string): Promise<User> {
    return await client.users.get(id);
}
```

Inference is fine for short internal helpers, but exported functions document themselves better with explicit return types.

### Don't swallow errors

```typescript
// Worse
try {
    await doThing();
} catch {
    // ignore
}

// Better — at minimum, log it
try {
    await doThing();
} catch (err) {
    this.wave.logger.addNodeLog(`Non-fatal: ${(err as Error)?.message ?? "unknown"}`);
}
```

### Defensive coding for `execute()`

External inputs, wildcard-resolved values, and third-party responses arrive with weaker guarantees than your TypeScript types suggest. Six rules; together they catch most of the runtime failures reviewers flag in PRs.

1. **`await` the promise *inside* the `try`.** `try { somePromise(); } catch {}` catches nothing — the rejection escapes the synchronous frame and surfaces as an unhandled rejection. Write `try { await somePromise(); } catch (err) { ... }`. This is the single most common dead-`catch` bug in async node code.
2. **Fail fast on undefined criticals.** If the rest of `execute()` cannot proceed without a value (a wildcard that didn't resolve, an optional field missing from an upstream JSON payload, a non-mandatory input the user cleared), `throw new Error("…")` at the read site with a three-part message (see `errors.md`). Letting `undefined` propagate produces confusing downstream errors at the wrong layer.
3. **Don't assume arrays are non-empty.** Guard before `.find(...)`, `[0]`, destructuring `const [first] = arr`. APIs that "return a list of resources" can return `[]`; a `STRING_LIST` input can be empty unless you mark it `mandatory: true` and the engine rejects empty.
4. **Capture critical state into locals before side-effecting I/O.** When a downstream step writes a file, deletes a resource, or makes another network call that could throw, copy the metadata you care about (status codes, response headers, returned IDs) into locals and set the corresponding outputs *first*. If the side-effecting step then fails, the workflow at least gets the upstream context — instead of swallowing the answer in a failed write.
5. **Wildcard-resolved values may already be parsed.** The wildcard resolver returns a number when the upstream value parses as one (see `wave-runtime.md` on `resolveValue`). For inputs that carry numeric-looking strings, check `typeof` before treating the value as a string — don't double-`Number(...)` a value the engine already coerced.
6. **External shapes are `unknown`, not the type you wish.** API responses, JSON inputs, and `ANY`-typed wildcards all need a type guard (see "Narrow with type guards, not casts" above) before reading fields. Casting through is faster to write and catastrophic to debug.

### No top-level mutable module state

Module-level `let` variables don't compose well with the wave-engine's per-execution lifecycle. Keep state inside `execute()` or its helpers; pass values via parameters/returns.

### Use the `node:` protocol for stdlib imports

```typescript
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
```

Disambiguates from npm packages of the same name, and the bundler handles it cleanly.

## When to ground from external sources

Fetch a page when you're:

- Using a TS feature added in the last year (template literal types, `satisfies` in unusual positions, `const` type parameters, decorators).
- Designing a complex generic — verify the API matches the latest handbook.
- Choosing between two equivalent patterns and unsure which is idiomatic now.
- Targeting a new Node.js version and wanting to know what stdlib is available.

Example:

```
fetch https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html "How to construct a type that's a key path through a nested object?"
```

## Anti-patterns

- **`as any` to make TypeScript stop complaining.** Almost always wrong. Find the actual type or write a guard.
- **`!` non-null-assertion liberally.** Each one is a runtime risk. Use only when you've genuinely verified the value isn't null and the compiler can't see the proof.
- **`@ts-ignore` / `@ts-expect-error` without a comment explaining why.** If you must suppress, document it. `@ts-expect-error` is preferred because the compiler complains if the error goes away (forces you to remove the suppression).
- **Disabling `strict` to make code compile.** Fix the types.
- **Using `Function` or `object` as types.** Too broad. Use a specific signature or `Record<string, unknown>`.
- **Reaching for `Pick`/`Omit`/`Partial` chains** when a simple intersection or interface would be clearer. Type gymnastics ages poorly.
- **Ignoring eslint warnings.** The blueprint's eslint config (including the `node-specification` rule) catches real issues. Read the warnings.

## Curiosity hooks

- The blueprint pins `typescript@^5.8.3` (not 5.5) — check `node_modules/typescript/package.json` for what's actually installed before assuming a specific release's features are available. The release notes for whatever version you find are short and worth a skim.
- The `typescript-eslint` project maintains rules that catch many of the patterns called out above (e.g., `no-explicit-any`, `no-non-null-assertion`, `prefer-as-const`). The blueprint already extends the recommended config.
- The `@typescript/native` rewrite of the TypeScript compiler (currently in development) is bringing 10× speedups. Worth keeping an eye on for build-time benefits.
