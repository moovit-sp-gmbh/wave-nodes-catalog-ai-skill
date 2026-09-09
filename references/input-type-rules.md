# Input-type-specific rules

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Read this when authoring or editing any node input. Each input type carries constraints that don't show up in the generic `mandatory` / `advanced` / `defaultValue` field reference — they come from how Stream Designer renders the type, how the engine coerces it, or how it composes with wildcards. This file is the canonical list. Other reference files link here at the decision points; if you only read this file, you should still have everything you need to author a correct input.

When a new type-specific rule emerges from review feedback, add it here rather than scattering it across naming, spec, or versioning files.

## BOOLEAN {#boolean}

**The rule.** A `BOOLEAN` input must always declare a `defaultValue` (literal `true` or `false`). It must never use `mandatory: false` without a default. The `mandatory: true` + `defaultValue` combination is also wrong — if there's a sensible default, the field isn't strictly required to run the node, so set `advanced: true` instead.

**Why.** Stream Designer renders a `BOOLEAN` as a checkbox. A checkbox has two states; there is no third "unset" or tri-state affordance for the user to leave the field blank. If the spec declares `mandatory: false` with no `defaultValue`, the UI silently shows the box as unchecked while the engine resolves the input to `undefined` — and the user has no way to distinguish "I deliberately left it" from "I forgot." Downstream code that wrote `as boolean` then receives `undefined` and fails on the first conditional. The frontend can't model the absent case, so the spec must not allow it.

**Canonical shape.**

```typescript
{
    name: Input.VERIFY_TLS_CERTIFICATE,
    description: "Verifies the TLS certificate before sending the request. When disabled, self-signed certificates are accepted.",
    type: StreamNodeSpecificationInputType.BOOLEAN,
    example: true,
    defaultValue: true,
    advanced: true,
}
```

Note: `mandatory` is omitted (defaults to `false`); `advanced: true` because the default is sensible for almost all callers; `defaultValue` matches `example` so the placeholder the user sees is the default they'll get if they don't touch it.

**Polarity.** Pick the default so the affirmative-named state is the safer or more common one. If the underlying flag is negative (`disable_tls_verify`, `skip_validation`), flip the polarity at the spec boundary: name the input in the affirmative (`Verify TLS Certificate`, default `true`), and translate to the negative inside `execute()`. Never ship `Skip TLS Verification, default: false` — the double-negative makes the checked state ambiguous. See `naming-and-style.md` for the full description-style rules on BOOLEAN labels and impact lines.

**TS accessor.** Cast as `boolean`, never `boolean | undefined`:

```typescript
const verifyTls = this.wave.inputs.getInputValueByInputName(Input.VERIFY_TLS_CERTIFICATE) as boolean;
```

The guarantee here is a **house-style/lint rule, not a compile-time one.** Checked directly against `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`: `StreamNodeSpecificationInput` only discriminates on `STRING_SELECT` vs. everything else (the `STRING_SELECT` variant requires `options`; every other type, BOOLEAN included, shares one shape). `defaultValue?: any` and `mandatory?: boolean` are both optional on **every** input type — TypeScript will happily let you author a BOOLEAN input with no `defaultValue` at all. The `boolean-default-required` rule in `style/rules.json` (enforced by the `boolean-default-required` ESLint rule, see `lint/rules/boolean-default-required.mjs`) is what actually stops you from shipping one — not the SDK's type system. Stream Designer still prefills the checkbox from `defaultValue` when it's present, and the engine coerces `"true"`/`"false"` strings to real booleans, but neither of those makes the field's *presence* guaranteed. See `input-coercion.md` for the broader bare-cast rules across all input types, and note that `defaultValue` is never substituted by the engine at runtime (see the next paragraph) — the checkbox-prefill behavior is a Stream Designer UI convenience, not a fallback your `execute()` can rely on if a stream is constructed programmatically without going through the UI.

The engine also coerces string `"true"`/`"false"` to real booleans before the value reaches your accessor, so you never need to handle string-shaped booleans yourself.

**Touching a legacy node.** Older nodes in the catalog may declare BOOLEAN inputs with `mandatory: false` and no `defaultValue` — these predate the rule. If you're editing one of these nodes for an unrelated reason, propose adding the `defaultValue` in the same change set as a non-breaking minor bump (the engine was already coercing `undefined`, so the new explicit default matches existing observed behavior). If the user declines, leave it. See `changelog-and-versioning.md` for the procedure.

## STRING_LONG {#string-long}

**The rule.** Pick `STRING_LONG` over `STRING` whenever the input is *naturally multi-line* **or** is content that benefits from a code editor with syntax highlighting. Default to `STRING_LONG` for any input the workflow engineer will realistically *paste* rather than *type*.

**Why.** Stream Designer renders `STRING_LONG` as a multi-line textarea. Critically, the textarea carries an **expand button** that opens the value in a small modal backed by **CodeMirror**, where the engineer can pick a language for syntax highlighting (current set, per the Stream Designer dropdown: HTML, JavaScript, JSON, Markdown, Python, Text, TypeScript, XML, YAML — verify against Stream Designer if more land). The modal gives them syntax highlighting, bracket matching, and proper newline handling. A `STRING` input is a single-line field with none of that — pasting a 40-line JSON body, shell script, or template into it is painful, visually truncated, and easy to corrupt with stray indentation. Choosing `STRING_LONG` is a UX decision in favor of the workflow engineer, not just a type decision.

**Canonical shape.**

```typescript
{
    name: Input.REQUEST_BODY,
    description: "Enter the HTTP request body to send with the call",
    type: StreamNodeSpecificationInputType.STRING_LONG,
    example: `{
  "title": "New ticket",
  "priority": "high",
  "labels": ["bug", "urgent"]
}`,
    mandatory: false,
    advanced: true,
}
```

The `example` is genuinely multi-line and realistic — that's what the engineer sees as a placeholder, and it demonstrates the shape at a glance. A one-line dummy (`"{}"`, `"<value>"`) wastes the textarea affordance; aim for 3–10 lines of plausible content. See [`naming-and-style.md`](./naming-and-style.md) (placeholder rules) and the `Enter the …` description opener convention at the same file.

**TS accessor.** Cast as `string` (or `string | undefined` when the input is otherwise optional — same string-input rules as in [`input-coercion.md`](./input-coercion.md)):

```typescript
const body = this.wave.inputs.getInputValueByInputName(Input.REQUEST_BODY) as string;
```

The engine has already coerced the value before it reaches the accessor: objects via `JSON.stringify`, scalars via `String(...)` (see [`input-coercion.md`](./input-coercion.md), row for `STRING` / `STRING_LONG` / `STRING_PASSWORD` / `STRING_READONLY`). Don't double-stringify.

**Use cases — pick `STRING_LONG`.** Non-exhaustive, grouped:

- **HTTP request bodies.** JSON, XML, form-urlencoded payloads, GraphQL queries, SOAP envelopes.
- **Code the node executes or transforms.** JavaScript, Python, TypeScript, SQL, regex with explanatory whitespace, JSONata / JMESPath expressions.
- **Shell commands or scripts.** Multi-line `bash -c` blocks, PowerShell, batch scripts. Pair with [`shell-injection-and-process-execution.md`](./shell-injection-and-process-execution.md) — `STRING_LONG` doesn't make user-supplied shell input safe.
- **Templates.** Mustache, Handlebars, Jinja, EJS, Liquid — any template source the node will render.
- **Config blobs the node parses.** YAML, TOML, INI, `.env` contents, Kubernetes manifests, Dockerfiles, `nginx.conf`.
- **Markup content.** Markdown or HTML blog posts, release notes, email bodies, chat messages with formatting, long descriptions.
- **Multi-line text the engineer composes.** Commit messages, PR descriptions, comments, notes, log-line samples for matchers, seed data, fixtures.
- **Long natural-language prompts** for LLM / AI nodes.
- **PEM-encoded certificates or public keys.** Secrets stay on `STRING_PASSWORD` — this is for the *non-secret* public half.
- **CSV / TSV blobs** the node will parse inline.

**When *not* to use `STRING_LONG`.**

- Single-line identifiers, URLs, IDs, status messages, short labels → `STRING`.
- Secrets (tokens, passwords, private keys, client secrets) → `STRING_PASSWORD`. See [`secrets-and-auth.md`](./secrets-and-auth.md). `STRING_LONG` is not masked.
- Already-structured `string[]` or `Record<string,string>` → `STRING_LIST` / `STRING_MAP`. Don't ask the engineer to paste a JSON array into a textarea when the engine can give them a typed list editor.
- Fixed enumerated choice → `STRING_SELECT`.
- Structured / mixed-type data an *upstream* node is already producing as an object → `ANY`. There is no `JSON` input type (`StreamNodeSpecificationInputType` in `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts` has no `JSON` member — only the output type does); `ANY`'s coercion rule is "no validation, whatever comes in is what you get" (`input-coercion.md`), so the object passes through untouched, with no `JSON.stringify` + re-parse round-trip. `STRING_LONG` is for the case where the engineer is *authoring* the JSON by hand in Stream Designer — the engine will `JSON.stringify` anything object-shaped wired into it, so parse and validate it back out at the `execute()` boundary.

**Touching a legacy node.** If you find a `STRING` input that's clearly being used for multi-line content (HTTP body, script, template), propose flipping it to `STRING_LONG` in the same change set. Changing input type is a **breaking change** under the rules in [`changelog-and-versioning.md`](./changelog-and-versioning.md) — apply the versioning procedure. If you can't justify a major bump for this alone, leave it and note it for the next breaking change.

## Conditional inputs — parked {#v4-dependent-inputs}

There is no conditional-input-visibility mechanism in the engine/SDK versions the blueprint installs — see `references/parked-v4-dependent-inputs.md` for the full explanation, the historical V4 design, and what to do today (state the condition in the input's `description`; validate presence inside `execute()` with a three-part error, never `mandatory: true` on a conditionally-needed input).

## Other type-specific rules

This section is intentionally a stub; rules accumulate here as they're added. Type-specific guidance currently lives in other files — see the "Per-type opening-verb rules" table in `naming-and-style.md` for the BOOLEAN opener/polarity bad-good pair and the STRING_LONG JSON-shape-hint row; STRING_SELECT option-value stability lives in `changelog-and-versioning.md`; URL-input naming convention lives in `naming-and-style.md`. When a new type-specific rule is introduced, write it here and breadcrumb from the file where the decision is made.
