# Additional connectors

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## The mental model

Additional connectors are **mid-execution outflow sockets** — extra outflows the node exposes *while it's still running* so a wired downstream node can react in real time to things that are *happening*, not to things that *happened*. Each connector wires to exactly one downstream node, so the unit of reaction is *one substream per invocation* (more on that below).

The shape (verified against `Outputs#executeAdditionalConnector` in `node_modules/wave-engine/helpers/Wave.js`, and the `StreamNodeAdditionalConnector` interface in `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`):

- **Each connector wires to exactly one downstream node.** The connector's runtime shape is `{ name, targetUuid }`: a name your `execute()` uses to address it, and a single `targetUuid` pointing at whichever node the workflow engineer wired to its outflow socket in Stream Designer. Wiring is one-to-one — a connector is *not* a broadcast channel to N subscribers.
- **`await this.wave.outputs.executeAdditionalConnector(name)` runs the substream rooted at that wired node**, to completion, before returning. The substream itself may branch into many downstream nodes — that's a sub-graph — but the entry point is exactly one node per call.
- **Each invocation triggers one substream run.** Loop N times → N sequential substream runs against the same wired entry node. Always `await` each call (see anti-patterns below).
- **Returns `Promise<StreamResult | undefined>`.** `undefined` means nothing is wired to that connector; if your iteration logic depends on the downstream having done something, check the return and warn (or fail) on undefined.
- **The node still ends with the standard Success or Fail edge** (Success if `execute()` resolves, Fail if it throws). Additional connectors do **not** replace Success/Fail; they're parallel outflows that fire alongside, before the terminal edge.
- **Each connector should have a paired output that the code re-hydrates *before* firing the connector each time** — the substream reads outputs via wildcards at its start, so the order matters: `setOutput`, *then* `executeAdditionalConnector`.

**Three legitimate use cases for additional connectors:**

1. **Iteration / loop over a list** — emit each item via the connector; the wired downstream substream processes that item; loop continues to next. The classic "for each" pattern.
2. **Progress** — emit progress milestones as the work advances; the wired downstream substream reacts per milestone (notify, log, push to an external system).
3. **Streaming chunks** — when wrapping a streaming API, emit each chunk as it arrives; the wired downstream substream reacts to each partial result.

If your candidate use case isn't one of these — if it's a *terminal* outcome the node only knows at the end (404, 429, validation failure, "the resource exists already") — that's **not** a connector. See the anti-pattern section below.

The converse holds too: an output that only makes sense mid-execution (`Progress`, `Current item`, `Chunk`) obliges a paired connector that fires when it changes. A `Progress` output with no `Progress` connector reaches nobody — the value is overwritten before the Success edge fires and the node's `updateProgress` already shows the same number in the UI. Either add the connector or drop the output.

## Loop / iteration pattern — the canonical use

When a node iterates over a list and wants the wired downstream node to process each item *as it's produced*, fire the connector once per item, awaiting each substream before continuing.

**Spec declaration:**

```typescript
specification: StreamNodeSpecificationV3 = {
    specVersion: 3,
    deprecated: false,
    name: "List folder contents",
    description: "Lists files in a folder, emitting each as it iterates",
    category: "Files",
    // ...
    outputs: [
        {
            name: "Current item",
            description: "The current file path emitted on each iteration of the Item connector",
            type: StreamNodeSpecificationOutputType.STRING,
            example: "/Users/helmut/cloud/helmut.txt",
        },
        {
            name: "Total items",
            description: "Returns the total number of files emitted once iteration completes",
            type: StreamNodeSpecificationOutputType.NUMBER,
            example: 12,
        },
    ],
    additionalConnectors: [
        {
            name: "Item",
            description: "Fires once per file, with the file path available on the 'Current item' output. The wired substream completes before the next iteration begins.",
        },
    ],
};
```

**In `execute()`:**

```typescript
async execute(): Promise<void> {
    const folderPath = this.wave.inputs.getInputValueByInputName(Input.FOLDER_PATH) as string;
    const entries = await listFiles(folderPath);  // your domain helper

    for (let i = 0; i < entries.length; i++) {
        // Cooperative cancellation — break the loop if the user stopped the stream
        if (this.wave.general.isCanceled()) {
            throw new Error(
                "Iteration canceled — user stopped the stream — no action needed",
            );
        }
        // 1. Hydrate the paired output BEFORE firing the connector
        this.wave.outputs.setOutput("Current item", entries[i]);
        // 2. Fire the connector — the substream reads outputs at its start
        await this.wave.outputs.executeAdditionalConnector("Item");
        // 3. Optional: report progress on the standard logger
        this.wave.logger.updateProgressAndMessage(
            Math.floor(((i + 1) / entries.length) * 100),
            `Processed ${i + 1} of ${entries.length}`,
        );
    }

    // Loop done — set summary outputs and resolve. Success edge fires after all
    // per-item substreams completed.
    this.wave.outputs.setOutput("Total items", entries.length);
}
```

**Key semantics to internalize:**

- **`await` each `executeAdditionalConnector`.** It runs the substream inline; without `await`, the substream runs concurrently with the next loop iteration and the paired output gets clobbered before the substream reads it. Always await.
- **Set the paired output *first*, then call the connector.** The substream reads outputs at its start. Swap the order and the substream sees the previous item (or undefined on the first iteration).
- **Check `isCanceled()` between iterations.** A long iteration without cancel checks ignores user stops.
- **The Success edge fires after the loop completes** — the user wires downstream-of-Success nodes to run *after* all per-item substreams finished.

## Progress pattern — same shape, fired on milestones

Same pattern as iteration, but instead of one fire per item, you fire when the underlying work emits a progress event or when you can calculate a milestone yourself.

```typescript
specification: StreamNodeSpecificationV3 = {
    // ...
    outputs: [
        {
            name: "Progress",
            description: "Current progress as a percentage (0–100), emitted on each Progress event",
            type: StreamNodeSpecificationOutputType.NUMBER,
            example: 50,
        },
        // ...usual outputs
    ],
    additionalConnectors: [
        {
            name: "Progress",
            description: "Fires as the operation advances, with the current percentage on the 'Progress' output",
        },
    ],
};
```

```typescript
for (let i = 0; i < chunks.length; i++) {
    if (this.wave.general.isCanceled()) throw new Error("Upload canceled — user stopped the stream — no action needed");
    await uploadChunk(chunks[i]);
    const percent = Math.floor(((i + 1) / chunks.length) * 100);
    this.wave.outputs.setOutput("Progress", percent);
    await this.wave.outputs.executeAdditionalConnector("Progress");
    this.wave.logger.updateProgressAndMessage(percent, `Uploaded ${i + 1} of ${chunks.length}`);
}
```

**Two parallel surfaces to be aware of**:

- **`wave.logger.updateProgress(percent)`** — updates the node's runtime progress value (see `Logger#updateProgress` in `node_modules/wave-engine/helpers/Wave.js`, which delegates to `ExecutionStateHelper#updateProgressAndMessage` in `node_modules/wave-engine/helpers/ExecutionStateHelper.js`). The value is displayed in the **high5 dashboard** and in the **Stream Designer debugger**. Always call it when you have a calculable percent; it's free and observers watching the run benefit.
- **`Progress` additional connector** — **declare it whenever the wrapped operation emits progress events or progress is calculable**. Whether a workflow engineer wires a downstream graph (notify per milestone, log a row to a dashboard, push to an external system) is their decision — the node's job is to *expose the capability*, not to pre-judge whether anyone will use it. Pair it with a `Progress` output that you hydrate *before* each fire (same order rule as iteration). Skip the connector only when progress is genuinely opaque — no events from the wrapped operation, no way to calculate a percent. Declaring `Progress` and never firing it misleads workflow engineers, who'll wire a downstream node that never runs.

## Anti-patterns

### Static outcomes as connectors

The 404 / rate-limited / "not-found" / "already-exists" cases are **terminal outcomes** the node knows *at the end*. They are **not** mid-execution emissions. Using a connector for them is wrong because:

- The connector pattern is "fire downstream while I'm still running" — there's no "still running" when the outcome is the result of the call.
- The Success/Fail edge is the right channel for terminal outcomes. Throw to take Fail with a three-part message.
- Modeling 404 as a connector encourages users to wire "Not found" handling that fires *in parallel* with Success — which never happens — and to skip the obvious "did this work?" check on Fail.

**Don't:**

```typescript
// ❌ Wrong — 404 is a terminal outcome, not a mid-execution emission
if (status === 404) {
    this.wave.outputs.setOutput("Not found id", id);
    await this.wave.outputs.executeAdditionalConnector("Not found");
    return;
}
```

**Do:**

```typescript
// ✅ Right — throw to Fail with a three-part message
if (status === 404) {
    throw new Error(
        `Could not retrieve customer — CRM returned 404 — verify the customer ID exists`,
    );
}
```

Users who want to branch on 404 specifically can read the error message on the Fail edge or wire a *Try / Catch* pattern at the stream level — both are existing Stream Designer affordances.

### Fire-and-forget connectors

Calling `executeAdditionalConnector(name)` without `await` lets the substream run concurrently with subsequent iterations. The paired output gets overwritten before the substream reads it; the substream sees the wrong data, or no data, or a race condition. **Always await.**

### Empty `additionalConnectors: []`

The custom ESLint rule warns on this. Drop the field entirely if you don't have connectors.

### Connector without a paired output

A `Progress` connector that fires without a `Progress` output, or an `Item` connector without a `Current item` output, leaves the downstream substream guessing what triggered it. **Every additional connector needs a paired output**, hydrated before each fire.

### Connector that duplicates Success

If you're tempted to `await executeAdditionalConnector("X")` and then *also* let Success fire to do the same downstream work at the same moment — drop the connector. Just let Success fire with the output set. This anti-pattern is about *redundant* connectors that produce the same effect as Success at the same instant; it does **not** apply to the legitimate side-channel cases (Item, Progress, Chunk), which are different from Success *by construction* — they fire per iteration during the run, while Success fires once at the end.

## Curiosity hooks

- The substream model means an iteration connector can fan out a whole sub-graph of nodes per item. Variables from the parent stream are inherited. Useful, but watch the cost — N items × M sub-graph nodes = N×M executions.
- `executeAdditionalConnector` returns `Promise<StreamResult | undefined>`. `undefined` means no node is wired to that connector. If your iteration logic depends on the substream having done something (e.g., the user is *supposed* to wire a processor downstream), check the return and warn if undefined.
- Connectors and Success/Fail are independent. Throwing from inside a loop after firing N iteration connectors will fire Fail at the end — the user gets N substream completions plus a Fail event, which is exactly right.
- Stream Designer renders additional connectors as extra outflow sockets on the node alongside the standard Success and Fail sockets. Naming connectors well matters for UI clarity: `Item`, `Progress`, `Chunk` — short, noun-shaped, what-it-emits.

