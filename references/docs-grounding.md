# Docs grounding — how to know what you don't know

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below. Newer engine and SDK majors exist and a first-party catalog may already pin one of them — never pin a `-dev` engine (`catalog-and-distribution.md`), and re-verify every stamped (engine) fact in this skill against whatever version is actually installed after any bump.

## When to use

Anytime you're about to commit a non-obvious decision about platform behavior, external API semantics, an npm package's surface, a TypeScript pattern, or a protocol detail. Don't guess; ground from a source. This file lists the sources in priority order with examples of when each is the right one.

## Pick the source by the *kind of question*, not by a fall-through tier

There is no universal "tier 1 → tier 5." Each source is authoritative for some questions and unreliable for others. The five sources below are listed in roughly *cost ascending* order (in-repo is free, a web search costs round trips), but **cost is not the same as authority** — for some questions, web search or external vendor docs are the *first* place to look, not a last resort. Route by question type:


| Question                                                                                                                                                                                                                   | First-best source                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| *"What does this codebase do?"* (engine helper signature, an existing node's pattern, the catalog constructor)                                                                                                             | **In-repo source** — read the file.                                                                                                                                                                                                                   |
| *"What does the installed dependency expose?"* (`hcloud-sdk` type shape, axios option, the wave-engine surface)                                                                                                            | `**node_modules`** after `npm install`. Type declarations are short and definitive.                                                                                                                                                                   |
| *"How does helmut.cloud behave at the platform level?"* (catalog install flow, agent caching, UI affordances, character limits, end-user workflows)                                                                        | **Ask the user, or read the wave-engine / hcloud-sdk / agent source under** `node_modules/` **(or the local checkouts).** When the runtime can't answer the question, surface the gap to the user rather than guess.                                  |
| *"How does this third-party API work?"* (Slack `chat.postMessage`, Stripe webhooks, an OAuth flow, an RFC, a vendor SDK)                                                                                                   | **External vendor docs / IETF / RFC** — fetch the page. These are the authoritative source for the wrapped service — not a fallback.                                                                                                                      |
| *"What's the modern best practice or known gotcha?"* (security pattern for `child_process`, idiomatic `AbortController` usage, deprecation status of an API, CVE history for a package, accessibility for a UI affordance) | **Web search across authoritative sources** — MDN, nodejs.org, typescriptlang.org, OWASP, NIST, official vendor blogs, well-cited GitHub issues, Stack Overflow consensus. **First-class source for design and safety questions, not a last resort.** |
| *"Is there a recent change I'd miss by reading old material?"* (Node `--security-revert` flags, a TS 5.x feature, an API v2 deprecation, a security advisory)                                                              | **Web search** filtered to vendor release notes / changelogs / advisories.                                                                                                                                                                            |


The detailed sections below describe each source — when it's the right pick, how to query it, and how to cite what you found.

## 1. In-repo source

Always your first move when the question is *"how does my code work?"*.

```bash
grep -r "getInputValueByInputName" wave-nodes-catalog-blueprint/
```

```bash
# Or open the file directly — read the canonical example
open /Users/.../wave-nodes-catalog-blueprint/lib/nodes/HttpClient.ts
```

**Cite paths and stable symbols** when you draw conclusions from source. The user (or you, next session) should be able to grep and verify. Examples: `node_modules/wave-engine/helpers/Wave.js` (look for `class Outputs`), `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts` (look for `StreamNodeSpecificationV3`).

**Do not cite line numbers** (`Wave.ts:343`). Line numbers rot the moment the file is edited — `:343` may point to whitespace or unrelated code by the next release. Path + symbol name survives refactors and reorders. Symbol = function name, class name, exported constant, distinctive section heading — whatever a `grep` will find.

## 2. Local `node_modules`

After `npm install`, you have authoritative type definitions and source for every dependency under `node_modules/`. Open the files directly:

- The exact shape of an `hcloud-sdk` type → `node_modules/hcloud-sdk/lib/interfaces/...`
- A wave-engine helper signature → `node_modules/wave-engine/...`
- An axios option → `node_modules/axios/index.d.ts`

Read the actual file rather than reasoning from memory — declaration files are short and definitive.

**When `node_modules/` isn't populated** (fresh clone, sandboxed environment, etc.):

- **Run `npm install` first.** Cheapest fix, almost always the right move.
- If installing isn't viable, **don't fabricate API surfaces from memory** — be explicit with the user that you can't verify the symbol you're about to use. Either ask them to run `npm install`, or fetch the package's GitHub README (the npm page often 403s), and cite what you grounded against.

The skill must never produce node code that imports a symbol it hasn't verified. Guessing a method name from memory is the fastest way to ship a runtime crash.

## 3. Platform behavior questions about helmut.cloud

**Don't query `docs.helmut.cloud` for agent grounding.** The site is **not currently prepared for AI agents** — `?ask=` and direct page fetches can dead-end on missing content, return outdated or contradictory answers, or quietly hand back generic text that *sounds* authoritative but isn't. Worse, there's no signal in the response that tells you the answer is wrong. **Treat it as not available** until that changes.

For platform-behavior questions (catalog install flow, agent caching, UI affordances, character limits, end-user workflows), the reliable sources are, in this order:

1. **The shipped type declarations under `node_modules/`.** wave-engine and hcloud-sdk ship both compiled `.js` and `.d.ts` files — most "does the engine do X" questions resolve by reading `node_modules/wave-engine/{nodes,helpers,utils,errors,models}/*.{js,d.ts}` and `node_modules/hcloud-sdk/lib/interfaces/**/*.d.ts` directly. This is the only source a customer installation actually has on disk, so it's also the only source worth citing in anything you write for the user.
2. **`scripts/engine-surface.mjs`.** Run it from the catalog root; it prints the installed `Wave` helper classes' public method signatures and the hcloud-sdk spec-type shapes it can extract mechanically. Use it before claiming a helper method exists or has a particular signature — it's faster and more reliable than re-deriving the surface from memory.
3. **This skill's own version-stamped references, for engine internals that aren't reconstructable from a type declaration** (wildcard scopes and their resolution mechanics, input coercion behavior, the mandatory-validator's exact semantics, cleanup/cancellation ordering). These facts were hand-verified by reading the actual compiled source once and are stamped in each reference file's opening line with the engine/SDK versions they were verified against — see `references/wildcards-and-variables.md`, `references/input-coercion.md`, and `references/cancellation-and-async.md` for examples of the stamp.
4. **`scripts/check-env.mjs` output**, to confirm which wave-engine/hcloud-sdk versions are actually installed. If the installed versions differ from a reference file's version stamp, say so to the user and treat every fact in that file marked `(engine, ...)` as **to be re-verified** rather than assuming it still holds — re-read the relevant `node_modules` source (or the `engine-surface.mjs` output) before relying on it.
5. **The user**, for anything none of the above answers. They have access to the running platform — they can open Stream Designer and see the actual behavior. For UI/UX questions ("what does the catalog list look like?", "is there a character limit warning?") the user can verify in seconds; you can't. **Surface the gap explicitly**: *"I couldn't confirm this in the installed wave-engine — would you check the Stream Designer panel for X and tell me what you see?"*

**Already-established platform facts** (captured here so other reference files don't have to re-discover them):


| Question                             | Answer                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| Are there official character limits? | No — Stream Designer does not enforce them. House style applies.            |
| Can a node mutate a stream variable? | No — variables are read-only from a node's perspective. Use inputs/outputs. |


If you discover another stable platform fact through source-reading or user confirmation, **add it to this table** so the next session inherits it.

## 4. External docs / npm package pages

**For an external API or protocol:**

- Fetch the official docs page. Look for: auth scheme, request/response shapes, error codes, rate-limit policy, pagination conventions.
- For an OpenAPI doc, parse it and follow `source-protocols.md#openapi`.
- For an RFC or standard, the IETF RFC index is canonical.

**For an npm package:**

- The package's npm page at `https://www.npmjs.com/package/<name>` is usually the first stop. **A page fetch may 403 on npm pages** depending on the package — fall back to the package's GitHub README, or read `node_modules/<name>/README.md` after `npm install`.
- For `hcloud-sdk` specifically, the local `node_modules/hcloud-sdk/` (after `npm install`) is the authoritative source. The npm page is gated and unreliable.

## 5. Web search

**First-class source for design, best practice, security, and recency questions** — Reach for it *first* when the question is *"what's the modern way to do X?"*, *"is there a known gotcha or CVE with Y?"*, *"what changed in the last release of Z?"*, or *"what's the consensus shape of this design?"* The answer to those questions does not live in your repo or your `node_modules`; it lives in the wider conversation among practitioners and the authoritative documents they cite.

```
search "axios AbortSignal cancel pattern node 20"
search "OAuth refresh token best practice 2026"
search "child_process spawn shell injection CVE history"
search "Slack chat.postMessage rate limit policy 2026"
search "Node.js execa execFile differences when to use"
```

**Filter for authority.** Prefer answers backed by primary sources — MDN (`developer.mozilla.org`), Node.js docs (`nodejs.org/api/...`), TypeScript handbook (`typescriptlang.org`), OWASP, NIST/CWE, IETF RFCs, the vendor's own docs/changelog/security advisories, well-upvoted Stack Overflow answers that cite primary sources, frequently-referenced GitHub issues on the project repo itself. Treat random blog posts and one-off tutorials as hints, not authority — but follow their citations back to the primary sources they should be referencing.

**Use the result to inform a decision, then ground the decision.** When web search turns up "the recommended pattern is X," the next step is usually to verify X works against the actual `node_modules` you have installed and the engine version you target — web tells you *what to look for*, the repo tells you *whether it's available here*.

**Fetching is the companion** to searching. Search to discover the URL of the authoritative source; fetch it to read the page in full and cite it. Don't paraphrase a search snippet — fetch the page.

## Citation discipline

When a non-obvious claim lands in a reference file or in your reasoning for the user, **cite the source**. Examples of well-cited claims:

- *"Input coercion happens before `execute()` runs — see `validateInputTypes` in `node_modules/wave-engine/nodes/Node.js`."*
- *"The secret store API lives in `node_modules/hcloud-sdk/lib/service/high5/space/secret/` — but don't call it from inside a node; see `secrets-and-auth.md`."*
- *"The Agent's `dev-wave/wave/debug` endpoint is what `npm run link` hits. The endpoint is exposed by the Agent itself; node authors interact with it only via the npm script, so there's no path inside `node_modules/` to cite."*

The user can open any of these paths to verify. This is what separates grounded advice from confident-sounding hallucination.

## What to do when sources disagree

Real situation. The blueprint says X; the docs say Y; the wave-engine source says Z. **The runtime always wins.** Whatever the wave-engine actually does in code is what your node has to live with. Docs and READMEs can lag.

If you find a conflict, surface it in your reply to the user with a note: *"The blueprint comment says the catalog logo must be 96×96, but I couldn't confirm that in the agent source. Going with 96×96 for now; flag if you know the authoritative answer or can check Stream Designer."*

## Anti-patterns

- **Confident-sounding claims without citation.** "The engine retries failed requests automatically" — no, it doesn't. If you didn't read the source, don't claim runtime behavior.
- **Inventing wave-engine API surface.** "Use `this.wave.secrets.get(...)`" — that doesn't exist (the secret store isn't reachable that way). Always grep the helper class before claiming a method exists.
- **Skipping grounding because "the answer feels obvious".** Especially with auth, encoding, and timing — your intuition about an external API is often a version behind. Two minutes of doc fetch beats an hour of debugging.
- **Fetching a page for every trivial fact.** Don't. Grounding has a budget. For things in this skill's own references, trust them.

## Curiosity hooks

- `node_modules/wave-engine` and `node_modules/hcloud-sdk` ship both compiled `.js` and `.d.ts` files, which is more than most npm packages give you — treat that as a standing invitation to read the actual implementation, not just the type shape, whenever a signature alone doesn't answer the question.
- When you cite a path, always use the *installed-package* form (`node_modules/<pkg>/...`), never an absolute machine path or a reference to an internal MoovIT source tree — the customer's copy of this skill has `node_modules/` after `npm install` and nothing else. A path that only resolves inside MoovIT's own checkouts is useless to the person actually running the skill, and would also read confusingly close to the `-dev` engine *versions* customers are told to avoid — keep the two concepts apart.

