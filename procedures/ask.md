# Asking the human

Use this when: you need an answer only the human can give — a scope decision, a naming call the repo doesn't settle, a tradeoff with no clearly-better default.

## Rounds, not batches

Ask at most three questions per round. Never bundle unrelated setup decisions (engine version + house style + scope) into one message — that reads as a configuration wizard, and half the decisions get skimmed past. A round may hold two or three questions only when they genuinely branch on the same answer (e.g. "which auth method" + "where do the credentials come from" — the second is moot if the first is "no auth"). When in doubt, ask one at a time and move to the next round after the answer comes back.

Every question carries:

- **A recommended answer.** Never ask a bare open question when you can propose one. "I'd default this BOOLEAN to `false` — the safer choice when the field is left untouched. Override?" beats "what should the default be?"
- **A one-line reason.** Say why you'd pick that answer, not just what it is.
- **Plain language.** Describe the outcome the human will see or decide, never an engine type name, a spec field, or an internal helper. Translate "STRING_SELECT vs STRING" into "should this be a dropdown of fixed choices, or free text?"
- **A short list of real alternatives**, only when alternatives genuinely exist and are worth naming.

"You decide" / "go with your recommendation" is always a valid answer — it means: use the recommendation and write it into the contract as a stated assumption, not a silent one.

## Scoping before plumbing

When the request is under-specified, the first question is always about *what to build*, never about engine plumbing. "Add a Slack node" → ask which Slack action and which auth model the catalog should support, not which wave-engine version to target. The scoping question settles the shape; only once the shape is sharp does a procedural question (engine version, catalog name) make sense.

**The engine version is never a blocking question.** `../scripts/check-env.mjs` (run at the start of every session) already reports what's installed — that's the target unless the human says otherwise. It surfaces in the contract review block as a stated fact ("targeting wave-engine `<version>`, the installed one"), never as a question posed before design starts.

## Never ask what you can answer yourself

Before raising a question, check: does `package.json`, another node in this catalog, or a reference file already answer it? If yes, go find it — don't make the human retype what the repo already knows.

## When no reply is possible

Some sessions can't come back for an answer — a one-shot run, or the human said "don't ask, just build." In that case, don't stall waiting for input that will never arrive:

- Take the recommended answer for every question you would otherwise have asked.
- Record every one of those as a stated assumption in the contract review block, and repeat the list in your final message so nothing is buried.
- Keep going through the runbook until `../scripts/verify.mjs` passes.

**One exception.** If the request is too vague to draft a contract from at all — no action and no domain named, like "add a Slack node" with nothing else to go on — stop and ask the scoping question anyway. Guessing at that level produces the wrong node entirely; there is no safe default to fall back on. A request with enough shape to reason about ("add a SHA-256 node", "add a node that lists Jitbit tickets") is never a reason to stop — take the recommended defaults and build it.

## Assumptions live in the contract, not in silence

If you make a call without asking — because the answer seemed obvious, the round budget was spent, or no reply was possible — don't bury it. State it as an assumption in the contract review block (`../templates/contract-review.md`) so the human can catch it in one read, rather than discovering it later in the code.

## After the contract is approved, stop asking

Once the human has approved the contract review block, don't reopen the question loop for routine implementation work. Come back only when a real decision appears: a change turns out to be breaking, a credential type the contract didn't anticipate shows up, or an engine rule conflicts with what was agreed. A verify failure you can fix yourself is not a reason to ask.

## House-style disclosure

State once, in the first round of a session, only when house style actually affects the answer you're about to give:

> Heads up — I'll apply MoovIT house-style defaults (naming, casing, error-message format, mandatory/advanced split, …). Say the word any time and I'll switch to your conventions, or override individual rules as we go.

This is a statement, not a question — don't wait for a yes/no before continuing. The human opts out by saying so ("use my style") or by adding a rule to `create-high5-nodes.config.json`; either way, record the override for the rest of the session and don't re-apply that rule.

## Example round

**Bad** — three unrelated decisions in one message, no recommendation:

> Which wave-engine version? Which naming style? What's the catalog scope?

**Good** — one question, a recommendation, a reason:

> Which ClickUp entities should this cover — Tasks, Lists, Spaces, Comments? I'd start with Tasks and Lists since that's what "track work items" usually means; we can add the rest later.
