# House style vs. user style

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

When deciding whether to apply a MoovIT-opinionated rule or defer to the user. Also any time the user pushes back on a rule — check this list first; if it's house style, defer to the user. If it's engine-mandatory, push back politely and explain why.

## How house style is applied (the disclosure-with-running-override model)

**House style is on by default — disclosed, not asked.** At the start of a session (per SKILL.md Step 1c), the agent opens with a **statement** that house-style defaults are being applied, plus an offer to override any of them at any time. The agent does **not** present this as a binary up-front question that the user must answer before anything else can happen.

**Overrides are per-rule and running.** The user can say "actually, use Title Case" or "skip the curl output for these" at any point in the session, and the agent records that as a per-rule override. The override persists for the rest of the session. There is no global "house style OFF" switch — the model is granular and additive.

**Surface specific calls inline.** When the agent is about to make a non-obvious house-style call (e.g., "I'd default this BOOLEAN to `false` — safer than `true`. Override?"), it flags it inline. This keeps the user informed without front-loading every rule in the opening turn.

**When the user opts out of a rule, record it.** Track per-rule overrides for the session so the agent doesn't re-apply the rule the next time it's relevant. If the user opts back in ("let's go back to house style for descriptions"), drop that specific override.

## What's opinionated (house style — overridable)

These are MoovIT preferences. Tagged in their reference files as `[House style — override if user prefers]`.

1. **Action, not endpoint.** A node represents a user-meaningful *action*, not a thin wrapper around one API/CLI/stdlib call. When the user describes a workflow ("upload a video", "provision a database"), reason from the action shape *first* and compose the underlying calls inside one `execute()` rather than fanning out into a chain of mechanical wrappers. This is the single most consequential house-style choice — opinionated catalogs feel coherent because every tile is an action the user wants to take, not a transport detail. Full pattern + worked examples in `references/action-not-endpoint.md`. Overridable only if the user explicitly wants endpoint-shaped granularity (e.g., a low-level SDK-flavored catalog).
2. **Mandatory vs. advanced input organization.** `mandatory: true` is reserved for inputs *strictly required to make the node run* (URL of the endpoint, file path to read, API key to authenticate). Everything else — toggles with sensible defaults, tuning knobs, edge-case behavior flags, retry/timeout, optional payload fields — sets `advanced: true` so Stream Designer hides them under the Advanced accordion. The panel opens to *just* what's required; tuning fields live one expand away. See `naming-and-style.md`.
3. **Axios HTTP nodes always ship a `Curl` output.** Type STRING, built via `wave.axiosHelper.convertRequestToCurl`, credential headers redacted to placeholder text. Lets workflow engineers reproduce the call in Postman / curl on their own machine. Treat as non-negotiable for any node that builds its own request through `wave.axiosHelper`; nodes calling through an SDK client (hcloud-sdk, AWS SDK) have no request config to convert and ship no `Curl`.
4. **Node names** — `<Verb> <Entity>` for CRUD; prefer two words. Pick one verb per HTTP method (Get / List / Create / Update / Replace / Delete). See `naming-and-style.md`.
5. **Categories** — pluralized entity, max two words. See `naming-and-style.md`.
6. **Node descriptions** — present tense, ends with product name, ≤ 85 chars, follows the per-verb template. See `naming-and-style.md`.
7. **Input naming** — **sentence case** (`Task name`, not `Task Name`), entity-qualified for entity-property inputs (`Task name`, not bare `Name`), "Enter the…" / "Select the…" / "Choose…" tone. URL-input pattern and sensitive-field pattern. See `naming-and-style.md`.
8. **Output naming — sentence case** — *Booking id*, *Status code*, *Task url*, *Project details*. Same casing rule as inputs and node names (unified). The raw entity response object (typed `JSON`) sits between the curated outputs and `Curl` when the call actually returns one — a Delete call typically doesn't, so it goes straight from its curated `Deleted id` to `Curl`. See `naming-and-style.md`.
8a. **No trailing period on descriptions.** Applies to spec, input, and output `description` fields. They're UI labels, not paragraphs. See `naming-and-style.md`.
9. **Output templates per HTTP method** — entity id + entity details + curl. See `naming-and-style.md`. (The engine emits `Run time` automatically via `node.<uuid>.info.runTime` — never declare it as a node output.)
10. **Character-limit table** — the entire soft-warning table in `naming-and-style.md` ("Character limits"). Stream Designer does not enforce these; they're a UX courtesy.
11. **Standard placeholder values** — helmut, cloud, hi@helmut.cloud, etc. See `naming-and-style.md`.
12. **Error message three-part format** — `[What failed] — [Why] — [What to check]`. See `errors.md`.
13. **Wavedoc tone** — descriptions open with the literal phrase "The …" + the actual node title + " node …" (e.g., "The HTTP Client node makes HTTP requests…"), imperative second-person, dual audience (Stream Designer users + AI agents). See `node-documentation.md`.
14. **TypeScript style conventions** beyond engine correctness — `satisfies`, `as const`, narrow with type guards rather than `as`. See `typescript-best-practices.md`.
15. **Always extract a domain helper class under `lib/helpers/`** when a catalog wraps an external system. Nodes delegate to it. See `catalog-and-distribution.md`.
16. **Rework: look for repeated logic across nodes and propose extraction.** When you touch a node and notice two or three others inlining the same idiom (HTTP setup, response normalization, error translation, polling, file-conflict handling), propose pulling it into `lib/helpers/`. The PR for the rework is the right moment. See the planning-phase nudge in `references/workflow.md`.
17. **File/folder operations must offer conflict-rule handling.** Any node whose action can collide at the OS level (create / copy / move / rename / download) exposes a `STRING_SELECT` input backed by `DuplicateFileOption` (*Overwrite* / *Rename* / *Increment* / *Skip* / *Fail* — for folder operations, `DuplicateFolderOption` instead, which has no `Overwrite` member; see `references/wave-runtime.md`). Canonical shape (adapted from a first-party catalog's file-action nodes, one example, house-style-cased):

    ```typescript
    {
        name: Input.ON_DUPLICATE,
        description: "Choose the conflict rule to apply when a file with the same name already exists",
        type: StreamNodeSpecificationInputType.STRING_SELECT,
        options: Object.fromEntries(Object.values(DuplicateFileOption).map((v) => [v, v])),
        example: DuplicateFileOption.SKIP,
        defaultValue: DuplicateFileOption.SKIP,
    }
    ```

    See the `file-conflict-handling` rule in `style/rules.json` (rendered in `references/house-style.md`) for the enforced version of this rule. Look for an existing `lib/helpers/` resolver before reimplementing the switch — if every node is open-coding it, propose extracting one as part of the change.

## What's engine-mandatory (NOT overridable)

These come from the wave-engine and hcloud-sdk themselves. The agent enforces them regardless of mode.

1. **Spec version is V3 for new nodes.** `specVersion: 3` with `deprecated: false` is the default. V4 (conditional inputs) is parked — the installed engine and SDK don't support it; see `references/parked-v4-dependent-inputs.md`. V2 is legacy — touching a V2 node, propose migrating to V3. V1 same. Required fields on V3: `specVersion`, `deprecated`, `name`, `description`, `category`, `version`, `author`, `inputs`, `outputs`.
2. **Each input and output must declare `name`, `description`, `type`, `example`.** The custom ESLint rule `node-specification` warns on missing `specVersion` and malformed `additionalConnectors`.
3. **`enum Input` and `enum Output` for field names** — referenced by tests and lint expectations.
4. **`async execute(): Promise<void>`** — no parameters, no return. All I/O via `this.wave.*`.
5. **Throw to fail, resolve to succeed.** No invented error-output fields. The engine wraps any non-`StreamNodeError` in `StreamNodeGenericError` with code 400.
6. **Never log `STRING_PASSWORD` values.** The engine does not auto-redact them — `addNodeLog(password)` will surface the credential to anyone who can see node logs.
7. **Never call the secret store API from inside `execute()`.** Secrets reach the node via an input field (type `STRING_PASSWORD`); the user supplies the value at design time however they choose — a literal, an upstream *Get Secret* node, the output of another node, a stream variable. *Get Secret* is the recommended production pattern, but the supply mechanism is the user's decision, not yours. See `secrets-and-auth.md`.
8. **`STRING_SELECT` input value is the option's value, not its display key.**
9. **Use the cancellation idiom** for any operation > 1s: poll `wave.general.isCanceled()` + `AbortController` + `Promise.race` + cleanup in `finally`. The engine does NOT cancel async work for you.
10. **For helmut.cloud interactions, use `hcloud-sdk`** via `wave.general.getHcloudClient()`. Hand-rolled HTTP against `api.helmut.cloud` is fragile. (Strongly recommended even outside house style; engine doesn't technically forbid it.)
11. **Match the blueprint's `package.json`** for engine-correctness deps (axios, hcloud-sdk, wave-engine). Don't downgrade or replace.
12. **Lint must pass** (`npx eslint`), typecheck must pass (`npx tsc --noEmit -p tsconfig.lib.json` — the base `tsconfig.json` has no `include` list and pulls in `evals/` and `tests/framework/`, which `scripts/verify.mjs` avoids by always passing `-p tsconfig.lib.json`), spec must round-trip through `npm run spec -- <NodeName>` cleanly.
13. **Wavedoc sidecar exists.** Format details are house style; **presence** is engine-mandatory because Stream Designer relies on it.

## What changes when a rule is overridden (concrete examples)

| Decision | Default (house style applied) | If user overrides this rule |
|---|---|---|
| New POST node naming | `Create ticket` (sentence case, verb + entity) | Whatever the user said |
| New GET (one) node naming | `Get ticket` | Whatever the user said |
| Output for `id` | `Task id` (sentence case) | `Task ID` / `taskId` / user's preference |
| Description length | Capped per the soft character-limit table (`naming-and-style.md#character-limits-soft-warnings`) | Whatever the user wants |
| Trailing period on descriptions | None | User's choice |
| Error message | `Could not write file — disk full — free up space` (three-part) | Whatever style the user uses (still: actionable, no stack traces) |
| Sensitive input type | `STRING_PASSWORD` always | `STRING_PASSWORD` recommended; user can choose |
| `Curl` output on HTTP nodes | Always included | Optional |
| Raw entity output on API-calling nodes | Present (typed `JSON`), between curated outputs and `Curl`, when the call returns one; omitted for empty-response calls like Delete | User's choice |
| Entity-qualified input names | `Task name` (not bare `Name`) | User's choice |
| Helper class extraction | Strongly nudged | Suggested if it'd reduce duplication |
| File-conflict input on OS-mutating nodes | Always offered (Overwrite / Rename / Increment / Skip / Fail) | Optional |
| `satisfies` vs `as` | Prefer `satisfies` | User's call |
| Wavedoc tone | `The Foo node…` + imperative second-person | User's tone |

## How the agent signals house style

**At session start (Step 1c disclosure template, paste-ready):**

> *Heads up — I'll apply MoovIT house-style defaults (naming, casing, error-message format, mandatory/advanced split, sentence-case strings, no trailing periods on descriptions, curated-then-raw-entity-then-curl output ordering, …). Say the word any time and I'll switch to your conventions, or override individual rules as we go.*

This is a **statement**, not a question. The agent does not wait for a binary yes/no — it proceeds with house style applied and the user can override any specific rule at any time.

**When making a non-obvious call inline:**

> *I'd default this BOOLEAN to `false` — safer when the user leaves the box untouched. Override?*

> *House-style choice: sentence case for the output name (`Task id`, not `Task ID`). Flag if you'd rather preserve the acronym.*

These inline flags are appropriate for calls the user might reasonably want to opt out of — they keep the user informed without front-loading every rule. **Don't** flag every default; only the ones with a real choice attached.

## Anti-patterns

- **Asking "house style or your own?" as a binary up-front question.** The disclosure is a statement, not a question. Front-loading a yes/no answer turns the opening into a configuration wizard.
- **Applying house-style rules silently after the user has overridden them.** Track overrides for the session and respect them.
- **Refusing to violate engine-mandatory rules even when the user insists.** Push back, explain why, ask if they want to ship anyway with a warning recorded somewhere. Don't silently disable an ESLint warning to make the user happy.
- **Treating "the user didn't push back" as endorsement.** If you applied a house-style rule the user didn't explicitly accept, mention it in your summary at the end so they can override.
