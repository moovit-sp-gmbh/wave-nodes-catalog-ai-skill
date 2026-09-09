# Cancellation, async, and cleanup

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Decide *before* writing `execute()` whether cancellation belongs in this node. Then revisit if the design changes.

## The mental model — two questions

Walk through these in order. The answer determines whether you bother:

1. **Will this node run an operation that takes more than ~5 seconds?** Anything CPU-bound that finishes in milliseconds — string transforms, hashing a short input, parsing — doesn't need cancellation; it's done before the user notices. Operations that *might* hang on a slow network, a polling loop, a big file copy, a long-running shell command, a chunked upload — those are candidates.
2. **Can the wrapped code/API be safely canceled or aborted at runtime?** This is the question that often decides it. Examples:
  - Axios HTTP request — yes, accepts an `AbortSignal`. Cancellable.
  - `child_process.spawn` — yes, kill the child on cancel. Cancellable. (For the kill mechanics — `SIGKILL` vs `SIGTERM`, process-group leaks when the child spawns grandchildren, race windows — see `references/shell-injection-and-process-execution.md`)
  - File copy via streams — yes, abort the read/write. Cancellable.
  - A one-shot RPC where the server *will* process the request regardless of the client disconnecting — no, the server still does the work. Skipping cancellation here is honest; faking it leaves zombies.
  - A blocking native binding (some db drivers) — sometimes no. Read the docs.
  - A pure synchronous CPU loop — no, JS can't preempt it. Either chunk the work yourself (yield between batches and check `isCanceled` between yields) or accept it's non-cancellable.

**If both answers are yes → implement cancellation** (the idiom below).

**If you're uncertain about (2)** — the API docs are ambiguous about whether the operation honors aborts — *prompt the user* before deciding. Don't guess. Example phrasing:

> *"This node will be wrapping the X API. The docs don't make it clear whether in-flight requests can be aborted server-side. Do you know if your team's deployment of X supports request cancellation, or is the in-progress work going to finish either way? If it's the latter, I'd skip the cancellation plumbing — it'd be misleading."*

**If (1) is yes but (2) is no** — document it. In the wavedoc, mention that the node cannot be canceled once it starts so users plan accordingly.

**If (1) is no** — skip cancellation. Don't over-engineer.

## Concept

When cancellation *is* warranted: the engine flips a flag (`isCanceled()` returns `true`) when the stream is canceled. Your `execute()` keeps running until it returns or throws — there is no auto-injected cancellation. You're responsible for polling the flag, aborting in-flight work, and throwing.

For resource cleanup that must happen *after* the node's success/fail decision (e.g., delete a temp file once the surrounding runner — the stream, or the substream for connector-wired nodes — has finished), set `this.onCleanup`. The engine calls it after every node in that runner has executed; see the [`onCleanup` section](#oncleanup-for-post-execution-resource-release) below for precise timing.

## The canonical idiom

`Promise.race` between (a) your real work, (b) a cancellation poll, and (c) an optional timeout. Always clean up the polling interval and the timeout in `finally`.

```typescript
async execute(): Promise<void> {
    let cancelInterval: NodeJS.Timeout | undefined;
    let timeoutId: NodeJS.Timeout | undefined;
    const controller = new AbortController();

    try {
        const url = this.wave.inputs.getInputValueByInputName(Input.URL) as string;
        const timeoutSec = this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) as number;

        // Real work: an HTTP request that supports AbortSignal
        const workPromise = this.wave.axiosHelper.makeRequest({
            method: "GET",
            url,
            signal: controller.signal,
        });

        // Cancellation poll: every 1s check the engine flag, abort if set
        const cancellationPromise = new Promise<"canceled">((resolve) => {
            cancelInterval = setInterval(() => {
                if (this.wave.general.isCanceled()) {
                    controller.abort();
                    resolve("canceled");
                }
            }, 1000);
        });

        // Optional timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                controller.abort();
                reject(new Error(`Request did not complete — timeout exceeded after ${timeoutSec}s — increase Timeout or check the server`));
            }, timeoutSec * 1000);
        });

        const result = await Promise.race([workPromise, cancellationPromise, timeoutPromise]);

        if (result === "canceled") {
            throw new Error("Request canceled — user stopped the stream — no action needed");
        }

        this.wave.outputs.setOutput(Output.BODY, result);
    } finally {
        if (cancelInterval) clearInterval(cancelInterval);
        if (timeoutId) clearTimeout(timeoutId);
    }
}
```

**Why every piece matters:**

- `controller.abort()` cancels in-flight axios calls — without it, the request keeps running even after `Promise.race` resolves.
- `clearInterval` in `finally` prevents the poll from continuing past `execute()` (would leak otherwise).
- `clearTimeout` in `finally` prevents the timeout from firing after success.
- Use `try/finally` in `execute()` for genuine resource cleanup (file handles, child processes, `onCleanup`).

## Loop-based cancellation

If your work is a loop (chunked upload, batch processing) rather than a single awaitable, check between iterations:

```typescript
for (let i = 0; i < chunks.length; i++) {
    if (this.wave.general.isCanceled()) {
        throw new Error("Upload canceled — user stopped the stream — no action needed");
    }
    await uploadChunk(chunks[i]);
    this.wave.logger.updateProgressAndMessage(
        Math.floor(((i + 1) / chunks.length) * 100),
        `Uploaded ${i + 1} of ${chunks.length}`,
    );
}
```

Polling between iterations is fine because each iteration is short. The 1s interval pattern is for *single long-running awaits* like a big HTTP request.

## `onCleanup` for post-execution resource release

Some resources need to live past the node's success/fail decision and only be cleaned up after the *runner that executed this node* finishes. For these, set `this.onCleanup` inside `execute()`:

```typescript
async execute(): Promise<void> {
    const tempPath = await this.wave.fileAndFolderHelper.createFile(
        path.join(os.tmpdir(), `helmut-${randomUUID()}`),
        DuplicateFileOption.FAIL,
    );

    this.onCleanup = async () => {
        try {
            await this.wave.fileAndFolderHelper.deleteFile(tempPath);
        } catch {
            // Engine swallows cleanup errors and logs them — safe to let them propagate, but
            // wrapping in try/catch keeps the cleanup robust if the file is already gone.
        }
    };

    // ... do work that uses tempPath, set outputs ...
}
```

**Exactly when cleanup fires** (engine, verified 2.0.1 — see `node_modules/wave-engine/utils/StreamRunner.js` and `node_modules/wave-engine/nodes/Node.js`, both compiled but readable):

- `StreamRunner.process()` collects each node's cleanup function (returned from the node executor) into a `cleanupFns` array as nodes finish, then — after its main while-loop over the stream's nodes exits — awaits them all in **reverse (LIFO) order**. The debug-mode path (`processDebug()`) does the equivalent via `unshift` plus its own `cleanup()` method.
- The relevant runner is the one that ran *this* node:
  - For nodes in the top-level stream → cleanup runs when the **stream** finishes.
  - For nodes executed inside a substream (i.e., wired via an additional connector) → cleanup runs when **that substream** finishes, which can be earlier than the parent stream's end.
- Cleanups run in **LIFO order** across the runner (last node's cleanup runs first). This matters if your cleanups have implicit ordering — design for it.
- `Node#cleanup()` (`node_modules/wave-engine/nodes/Node.js`) is what actually invokes your `onCleanup`: `await this.onCleanup?.().catch(err => this.wave.logger.updateMessage(...))` — a thrown/rejected cleanup is caught right there and logged via `wave.logger.updateMessage`, not re-thrown. It does not fail the stream. Wrapping your own cleanup in `try/catch` is still good hygiene against e.g. "file already gone" races.

**`onCleanup` is for cross-node lifecycle.** If your resource is only needed during *this* node's `execute()` (e.g., a TCP connection you open and close in the same method), use a `try/finally` block — don't bother with `onCleanup`.

## When to throw on cancellation vs. return silently

**Throw** when:

- The user expects the node to have completed the action. (Most cases.) Throwing fails the node and tells downstream nodes the work didn't happen.
- A partial result is worse than no result.

**Return silently** (no throw, partial outputs set) when:

- The node represents a streaming operation where partial progress is meaningful (e.g., process N records, "canceled after 47 of 100" is useful information).
- You're sure no downstream node will mistake a successful exit for "all work done".

When in doubt, throw. The "What failed — Why — What to check" message format makes the cancellation visible to the workflow engineer.

## Anti-patterns

- **`setTimeout` to "give up" without `AbortController`.** The timeout fires, your race resolves — but the actual HTTP request is still pending. Memory and connection leak. Always pair timeouts with abort signals.
- **Polling `isCanceled()` in a tight loop without a `setInterval`.** Burns CPU. Use a 1s interval for await-based waits; check between iterations for loop-based work.
- **Forgetting to `clearInterval` in `finally`.** The interval keeps firing after `execute()` resolves, against a node that's gone. Sometimes innocuous, sometimes loud (e.g., a long-running setInterval that grabs locks).
- **Calling `wave.general.cancelExecution()` from inside one node to fail the stream.** That's not what it's for. To fail the stream, `throw new Error(...)`. `cancelExecution` is for special cases where the engine itself should treat the run as canceled (rare; verify with `references/wave-runtime.md`).
- **Using `onCleanup` for things that should be `finally`.** If the resource only matters during `execute()`, close it in `finally`. `onCleanup` is for resources that should outlive the success/fail decision.
- **Declaring a `Run time` output or wrapping `execute()` in `try/finally` solely to measure duration.** The engine emits `node.<uuid>.info.runTime` automatically (see `references/naming-and-style.md`). Use `try/finally` only for genuine cleanup (file handles, child processes, `onCleanup`).

## Curiosity hooks

- The engine's `StreamRunner` checks `cancelled` between nodes (won't start the next one if the stream is canceled), but it cannot interrupt a node mid-execution. That's why your `execute()` has to cooperate.
- `AbortController` is the standard primitive for canceling fetch/axios/streams in modern Node.js. The wave-engine helpers (`fileAndFolderHelper.copyFile`, `axiosHelper.makeRequest`) all accept `AbortSignal`. If you wrap an external library that *doesn't* accept one, your node can't be cleanly cancelable — flag this to the user.
- For a real example of the full idiom (race + poll + abort + timeout + finally), the `RunDockerImage` node in the Docker catalog is the cleanest reference. Same pattern applies whether you're running a container, calling a long HTTP endpoint, or polling a job.

