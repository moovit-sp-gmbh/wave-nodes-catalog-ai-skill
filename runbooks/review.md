# Reviewing a node or a change

Use this when: the human asks "is this node right", wants an audit, or is reviewing a change that touches `lib/nodes/`.

Script paths below assume the skill is installed at `.agents/skills/create-high5-nodes/`; adjust the prefix to wherever it actually lives. Run them from the catalog root.

Work the checkpoints in order. Each has five parts: **Gather** (what to open or run), **Decide** (what you settle yourself), **Ask** (what needs the human — "nothing" is a valid value; see `../procedures/ask.md`), **Produce** (files or messages), **Done when** (the observable condition that lets you move on).

## 0. Environment and scope

**Gather:** run `node .agents/skills/create-high5-nodes/scripts/check-env.mjs` (skip if already run this session). Determine what's in scope — a single node, a diff, or the whole catalog.
**Decide:** nothing beyond scoping.
**Ask:** only if the request doesn't say what's in scope — "Reviewing everything, or just `<files>`?"
**Produce:** nothing user-facing yet.
**Done when:** you know exactly which files you're reviewing.

## 1. Mechanical pass

**Gather:** run

```
node .agents/skills/create-high5-nodes/scripts/verify.mjs --node <Name>
```

(drop `--node` for a whole-catalog review); run `node .agents/skills/create-high5-nodes/scripts/style.mjs effective` to see which house-style rules this catalog has switched off via `create-high5-nodes.config.json`.
**Decide:** nothing yet — record findings with rule ids as they surface.
**Ask:** nothing.
**Produce:** the collected findings so far, each tagged with a rule id where one applies.
**Done when:** both commands have run and their output is captured.

## 2. Contract pass

**Gather:** the node's `.ts` spec.
**Decide:** compare it against `../procedures/node-contract.md`'s order and cite the matching rule id from `../references/house-style.md` for anything off — cite the rule id, don't restate the rule text:

- name — `node-name-verb-noun`, `sentence-case-names`
- category — `category-plural-entity`
- description — `node-description-template`, `description-is-label`, `no-trailing-period-description`, `character-limits`
- inputs — mandatory/advanced split (`mandatory-vs-advanced`), entity prefix (`input-entity-prefix`), credentials (`credentials-string-password`), examples (`example-required`), count under the triage threshold (`input-count-triage`)
- outputs — curated first, raw entity noun, `Curl` last, type priority, `Total count` on list nodes (`curated-output-wireability`, `raw-output-entity-noun`, `curl-on-http-nodes`, `curl-output-last`, `output-type-priority`)
- connectors — `additional-connectors-mid-execution-only`
- error messages — three-part pattern (`three-part-error-message`)
- wavedoc coverage — one `causes:` entry per distinct throw (`wavedoc-format-and-causes`, `wavedoc-sidecar-required`)

**Ask:** nothing.
**Produce:** findings for anything off, each with its rule id.
**Done when:** every section of the contract order has been checked.

## 3. Runtime pass

**Gather:** the node's `execute()` body; the installed helper surface (`node .agents/skills/create-high5-nodes/scripts/engine-surface.mjs`).
**Decide:** check for — cancellation and cleanup on long-running work; no secret-store calls inside `execute()` (`no-secret-store-in-execute`); no wildcard-resolved input built into a shell string (`no-shell-string-injection`); no class self-reference inside the class body — a static helper called as `ClassName.helper()` or an `instanceof ClassName` check; esbuild renames self-referencing classes and the catalog's lookup by constructor name breaks (`no-class-self-reference`); `minimumEngineVersion` is not a `-dev` tag; every `this.wave.*` helper the node calls actually exists on the installed engine.
**Ask:** nothing.
**Produce:** findings for anything that fails these checks.
**Done when:** every item on this list has been checked.

## 4. Report

**Gather:** the findings from checkpoints 1–3.
**Decide:** severity per finding — engine rule (never bends) / house style (overridable) / suggestion (no rule backs it, your judgment call).
**Ask:** nothing, unless a finding's severity is genuinely ambiguous.
**Produce:** a findings table — severity, `file:line`, rule id, one-line fix — and an explicit statement of what passed clean. Apply fixes only if the human asks, or the original request was "fix it" — never edit silently during a review. If the human then asks to fix everything, continue in `rework.md` with this report as the input.
**Done when:** the report has been delivered.

## 5. Done when

The report is delivered and, if fixes were requested, verify passes after applying them.
