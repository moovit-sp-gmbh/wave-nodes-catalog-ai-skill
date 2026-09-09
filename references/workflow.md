Routed from runbooks/build.md checkpoint 5

# Workflow: TDD cadence

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Once a node's contract is approved (`../procedures/ask.md`, `../templates/contract-review.md`) and checkpoint 5 of `../runbooks/build.md` begins implementation. The intent-loop/question-asking content that used to live here moved out: house-style disclosure, rounds-not-batches, and "never ask what you can answer yourself" are `../procedures/ask.md`; restating intent, sizing the request, and the per-node contract (naming, inputs, outputs, connectors, errors) are `../runbooks/build.md` checkpoints 1–3 and `../procedures/node-contract.md`. What's left here is the one planning-phase check that isn't owned by either, plus the TDD cadence itself.

## Shared logic — pause to look for it

Before writing the implementation, scan `lib/helpers/` and the existing nodes for logic that could be reused or factored out. House-style move when this lands:

- Adding a *new* node to a catalog that already wraps an external system → there should already be a `lib/helpers/<domain>-client.ts` (or similar). Delegate to it; don't reimplement the auth/transport/retry inline.
- Adding the *first* node that wraps an external system → create the helper class as part of this work, not as a follow-up. Even one node is enough to justify the extraction if you can see the next two coming.
- **Reworking** an existing node → if the rework reveals two or three nodes inlining the same idiom (HTTP setup, response normalization, error translation, polling), propose extracting it. The PR for the rework is the right moment; the user is already in the file.

Surface this as a one-line suggestion to the user: *"I noticed nodes X and Y both do <thing>. Worth extracting to `lib/helpers/<name>.ts` so future nodes don't repeat it? It'd add ~30 lines to this change but shrink every future node that needs <thing>."* — let them decide.

## The TDD cadence

**Offer TDD only for non-trivial nodes** — anything beyond a one-shot transform. For pure transforms ("convert markdown to HTML"), the spec round-trip is the test.

**Cadence:** vertical tracer bullets, not horizontal slices.

```
WRONG (horizontal):
  RED:   write tests for parse, validate, render, format
  GREEN: implement parse, validate, render, format

RIGHT (vertical):
  RED→GREEN: test parse → implement parse
  RED→GREEN: test validate → implement validate
  RED→GREEN: test render → implement render
```

**Test the helpers, not `execute()`.** The full `execute()` path needs the wave-engine runtime — slow to iterate against. Extract the *pure* parts (parsers, validators, transformers, response shapers) as module-level exported functions, or instance methods called via `this`. Test module-level functions directly; test instance methods through an instantiated node. Never call a static helper by the class's own name from inside the class body (`no-class-self-reference` — esbuild rewrites a self-referencing class and the blueprint's Catalog can no longer find it); the module-level form is also the easiest to unit test since it needs no node instance at all.

**One test → one helper → repeat:**

```typescript
// lib/nodes/MyNode.ts
export function parseCsvRow(row: string, delimiter: string): string[] {
    // ...
}

// tests/nodes/MyNode.test.ts
import { parseCsvRow } from "../../lib/nodes/MyNode";

describe("parseCsvRow", () => {
  it("splits on the delimiter", () => {
    expect(parseCsvRow("a,b,c", ",")).toEqual(["a", "b", "c"]);
  });
  it("handles a trailing empty field", () => {
    expect(parseCsvRow("a,b,", ",")).toEqual(["a", "b", ""]);
  });
  it("respects a custom delimiter", () => {
    expect(parseCsvRow("a|b|c", "|")).toEqual(["a", "b", "c"]);
  });
});
```

**Rules per cycle:**

- Test describes *behavior*, not internals. "splits on the delimiter" beats "calls String.split".
- Test uses the public interface only. Don't reach into private methods.
- A test that survives an internal refactor was a good test.
- Code is minimal for *this* test. Don't speculate on tests you haven't written yet.
- After all reds are green, **refactor** — extract duplication, move complexity behind narrow interfaces, run tests again. Never refactor while red.

## Anti-patterns

- **Pre-writing the full test file before any implementation.** Produces tests of *imagined* behavior, not real. Vertical slices win.
- **Mocking `this.wave` in unit tests.** Tests become coupled to the runtime; refactoring breaks them. Test pure helpers, leave orchestration to the integration layer.

## Curiosity hooks

- The TDD philosophy is adapted from John Ousterhout's *A Philosophy of Software Design* and the classic red-green-refactor cadence — the value of deep modules and stable public interfaces shows up vividly in node authoring because the spec **is** the public interface.
