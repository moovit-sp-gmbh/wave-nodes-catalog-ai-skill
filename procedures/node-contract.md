# Deriving a node's contract

Use this when: you're about to design (or redesign) a single node — from a fresh intent, an API/CLI sketch, or an existing node being changed — and need to settle its contract before any file is written.

This is the order of decisions, and the question to raise at each one when the repo or references don't already answer it (rules for *how* to ask live in `ask.md`). It doesn't restate rule text — each step cites the rule id or reference that owns the rule; look there for the statement, rationale, and examples.

## 1. Node name

Verb + entity, sentence case at the display-name layer, PascalCase for the class (`CreateTicket`, `GetTicket`, `ListTickets`). One verb per HTTP method or CLI action: Get (single), List (many), Create, Update, Delete, or one from the non-CRUD list in `../references/naming-and-style.md` ("Node names"). If no listed verb fits, do not invent one silently and do not force a poor match: propose the closest listed verb and the verb you would add, as one question in the contract block, and record the answer as a vocabulary decision. Rule ids: `node-name-verb-noun`, `sentence-case-names`. If several underlying calls compose into one user-meaningful action, name the action, not the mechanism — rule id `action-not-endpoint`, `../references/action-not-endpoint.md`.

## 2. Category

Pluralized entity name, short, consistent with sibling nodes already in the catalog. Rule id: `category-plural-entity`.

## 3. Description

Present tense, action verb the user would say, ends with the product/entity name, no trailing period, within the character limit. Rule ids: `node-description-template`, `description-is-label`, `no-trailing-period-description`, `character-limits`.

## 4. Inputs

Work from the API/CLI's required and optional parameters, in this order:

1. **Mandatory first** — only what's strictly required to run (endpoint, path, credential). Rule id: `mandatory-vs-advanced`.
2. **Everything else is `advanced: true`** — tuning knobs, optional payload fields, retry/timeout.
3. **Entity-prefix property inputs** — `Task name`, not bare `Name`. Rule id: `input-entity-prefix`.
4. **Credential inputs are `STRING_PASSWORD`**, house naming pattern. Rule ids: `credentials-string-password`, `credential-and-url-input-naming`; reference `../references/secrets-and-auth.md`.
5. **Every input needs a realistic `example`**, and every `BOOLEAN` needs a literal `defaultValue`. Rule ids: `example-required`, `boolean-default-required`.
6. **Redundant-input check** — if the API expresses one logical value two ways (text/markdown, id/slug, inline/URL), collapse to one input or add a format toggle; don't expose both silently. See `../references/specification.md` ("Curated abstraction, not transliteration").
7. **Machine-friendly translation** — if the API wants a form no human types by hand (epoch ms, base64, packed flags), expose the human-typeable form and convert at the `execute()` boundary. Rule id: `machine-value-translation`.
8. **Runtime UX** — drop raw pagination fields unless the node genuinely iterates; a search node needs at least one visible filter criterion; credential/URL descriptions use the house pattern, never vendor onboarding copy. Rule id: `search-and-pagination-inputs`.
9. **Count triage** — keep what's *visible* (mandatory + visible-optional) under roughly eight; past that, or past ~10 total, triage with the human rather than silently exposing everything. Rule id: `input-count-triage`. When you triage, propose two paths — curate the cut list yourself with one-line rationales, or hand the human the full list to check off — and default to curating unless told otherwise.

## 5. Outputs

1. **Curated outputs first** — pick fields that pass a wireability test (primary identifier, external link, branchable state, count, stable typed primitive). One rationale sentence per field, naming the downstream use. Rule id: `curated-output-wireability`; reference `../references/naming-and-style.md` ("Curated output reasoning") for the archetype-by-archetype minimums (List / Get / Create / Update / Delete). For a list/search node specifically, the curated minimum is explicit: `Total count` (NUMBER) and the primary id list (`<Entity> ids`, STRING_LIST), before the raw entity array and `Curl`.

   **Generic HTTP-client exception:** a node whose purpose is an arbitrary HTTP call (no entity) may expose `Status code` and name the raw output `Response body` instead of an entity noun. When it must report a status code, it can't use `wave.axiosHelper.makeRequest` — that helper discards the status — so it calls `axios` directly with `validateStatus: () => true`. Reference `../references/wave-runtime.md`.
2. **Raw entity next** — the entity noun (`Task`, `Ticket`), never `Result` / `Data` / `Body` / `Response body` (generic HTTP-client nodes are the one documented exception). Rule id: `raw-output-entity-noun`.
3. **`Curl` last**, only on nodes that send their own request via `wave.axiosHelper` (never on SDK-client nodes), except multipart requests (the helper doesn't support form data — skip the output and say why in the wavedoc, or hand-build a best-effort string). Rule ids: `curl-on-http-nodes`, `curl-output-last`.
4. **Type priority** — `STRING_LIST` / `STRING_MAP` / `STRING_LONG` before reaching for `JSON`; `JSON` only for genuinely heterogeneous shapes. Rule id: `output-type-priority`.
5. **Never a shared output enum** across nodes, even when two nodes' shapes look alike. Rule id: `no-shared-output-enum`.
6. **Never a `Run time` output** — the engine already exposes duration via a wildcard. Rule id: `no-run-time-output`.
7. **Extract the shared client before the second node** — when a second node in this build targets the same base url or SDK client as a node already implemented, extract the shared request, curl, and error-mapping code into `lib/helpers/<Product>Client.ts` *before* implementing the second node. Each node's `enum Output` still stays per node — see `../references/naming-and-style.md` ("Outputs are per-node — never extracted into a shared catalog-level constant").

## 6. Connectors

Success/Fail by default. Add an additional connector only for a mid-execution emission — one per loop item, one per progress milestone — never for a terminal outcome (that throws to Fail instead). Rule id: `additional-connectors-mid-execution-only`; reference `../references/additional-connectors.md`.

## 7. Error cases

For each distinct way the node can fail, draft the three-part message: what failed — why — what to check. Rule id: `three-part-error-message`; reference `../references/errors.md`. Each distinct error class also becomes one `causes:` entry in the wavedoc (step 8).

## 8. Wavedoc summary sentence

Draft the one-sentence description the wavedoc opens with: "The `<Node name>` node …". Full format in `../references/node-documentation.md`; this step only settles the sentence, not the whole doc — the doc itself is written in `../runbooks/build.md` checkpoint 6.

## 9. Fill in the contract review block

Once steps 1–8 are settled (with the human's input where a real decision was needed, per `ask.md` — including the engine version, which arrives as a stated fact from `check-env.mjs`, not a question), fill `../templates/contract-review.md` and post it. That block, and the human's approval of it, is the single gate before any file is written.
