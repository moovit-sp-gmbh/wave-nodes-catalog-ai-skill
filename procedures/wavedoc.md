# Writing or updating a wavedoc

Use this when: writing or updating a node's `lib/nodes/<Name>.md`. Full format, tone rules, and the type vocabulary live in `../references/node-documentation.md` — cite it rather than restating the type list here.

## Derivation order

Work from the contract, not from imagination — the wavedoc describes what shipped, it doesn't design anything new:

1. **Opening sentence** — from the contract's wavedoc-summary step (`node-contract.md` step 8): "The `<Node name>` node …", present tense.
2. **One entry per input, in spec order** — name matches the spec exactly, description, type, `mandatory` flag, a realistic example.
3. **One entry per output, in spec order** — name matches the spec exactly, description, type, a realistic example.
4. **Connectors** — `Success` and `Fail` always; any additional connector, describing what fires it.
5. **One `causes:` entry per distinct throw in `execute()`** — walk every `throw new Error(...)` path and give each a name and a one-sentence trigger description, using the shared cause vocabulary in `../references/node-documentation.md` where one fits.
6. **The "how it is typically used" sentence** — only when the node is part of a chain a stream typically wires it into (Create → Update, List → Get one); one sentence in the description naming the chain. Skip it when the node isn't typically chained.

## The checks

- Every spec input and output appears exactly once in the wavedoc, under the same name — no missing fields, no leftover entries for a field that was renamed or removed.
- Every distinct throw in `execute()` has a matching `causes:` entry — a node with one failure mode has one cause; a node with five has five. No "MVP" exemption.
- No procurement or vendor-onboarding copy in a credential input's description — say what the value is for, not how to obtain it from the vendor's own signup flow.

## How verify checks this

`../scripts/verify.mjs`'s `wavedoc` check (`--only wavedoc`, or scoped to one node with `--node <Name>`) confirms the sidecar file exists next to the `.ts` file and is structurally present — it does not grade prose quality or field-by-field coverage, so the checks above are yours to hold, not something a clean verify run proves for you.

## Format and type vocabulary

Don't re-derive the YAML shape or the type vocabulary here — see `../references/node-documentation.md` for the exact structure (`::wavedoc` delimiters, field order, `STRING_SELECT` options block, the shared failure-cause vocabulary table) and the full tone rules (imperative second-person for inputs, declarative for outputs/connectors, present tense, no developer jargon, no marketing language).
