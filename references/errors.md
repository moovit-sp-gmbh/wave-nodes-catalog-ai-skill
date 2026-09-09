# Error handling and error messages

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Every time you write `throw new Error(...)`. Every time you read an error from an external library and need to surface it to the user.

## How the engine handles errors

- **Throw to fail.** If your `execute()` throws *any* error, the engine catches it and the node fails — the Fail output is taken, the message becomes the failure message visible to the workflow engineer.
- **Resolve to succeed.** If your `execute()` returns/resolves, the node succeeds — the Success output is taken.
- **Errors get wrapped.** Throwing `new Error(message)` produces a `StreamNodeGenericError` with code `400` and `detail: undefined`. The message is preserved verbatim in the user-facing failure message.
- `**StreamNodeError` subclasses get passed through with their own code and detail.** This is internal — see the `[Internal/Helmut authors]` section below.

Source: `node_modules/wave-engine/utils/NodeExecutor.js` — look for the `catch` block that wraps `await this.node.execute()`. Error class definitions live in `node_modules/wave-engine/errors/StreamNodeErrors.js`.

## The three-part error message pattern `[House style]`

Every error your node throws becomes a string the user reads in the Stream Designer when the Fail output fires. House style: write it as exactly three components separated by `—` (em-dash + single space):

```
[What failed] — [Why] — [What to check]
```

Each component is **one short sentence**:


| Component         | Form                                                   | Examples                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What failed**   | Verb phrase about the action the node was attempting   | *Could not write script to temp directory*, *Dialog did not appear*, *User canceled the dialog*, *Request returned an error*, *Could not parse CSV row*                                                                    |
| **Why**           | Noun phrase or short clause naming the proximate cause | *disk full*, *PowerShell exited with code 1*, *the Escape key was pressed*, *server returned 503*, *delimiter not found in input*                                                                                          |
| **What to check** | Imperative actionable hint for the workflow engineer   | *free up space in %TEMP%*, *verify the runner has Notifications permission in System Settings*, *this is expected if the user dismissed the dialog*, *check the API status page*, *set Delimiter to match the file format* |


**Three worked examples:**

```
Could not write script to temp directory — disk full — free up space in %TEMP%
Dialog did not appear — PowerShell exited with code 1 — verify the runner has Notifications permission in System Settings
User canceled the dialog — the Escape key was pressed — this is expected if the user dismissed the dialog
```

**More examples by domain:**

```
Could not retrieve customer — CRM API returned 404 — verify the customer ID exists in your CRM
Could not upload file — connection reset by server — retry the upload or contact your CDN provider
Request timed out — server did not respond within 30 seconds — increase Timeout or check the server's availability
Could not parse response — server returned malformed JSON — verify the API endpoint and version
Could not authenticate — bearer token expired — refresh the token and re-wire the Bearer token input
```

## The pattern in code

```typescript
try {
    const response = await this.wave.axiosHelper.makeRequest(config);
    this.wave.outputs.setOutput(Output.BODY, response);
} catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
        throw new Error(`Could not retrieve resource — server returned 404 — verify the URL and that the resource exists`);
    }
    if (status === 429) {
        throw new Error(`Could not complete request — server returned 429 (rate limited) — add a delay between calls or upgrade your plan`);
    }
    const message = (err as Error)?.message ?? "unknown error";
    throw new Error(`Could not complete request — ${message} — verify the URL, network connectivity, and authentication`);
}
```

Notice: the `catch` branch picks the most specific message it can. Generic catch-all is the last resort, not the only path.

## Terminal outcomes → throw to Fail. Always.

Every outcome the node only knows *at the end* of its work is a terminal outcome. Network errors, HTTP non-2xx, "resource not found", "already exists", "rate limited", validation failures, disk-full, user-canceled — all of these belong on the **Fail output** with a three-part message. They do **not** belong on additional connectors.


| Situation                                 | Outcome output                                                                                        | Message                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| HTTP 500                                  | Fail (throw)                                                                                          | `Could not <action> — server returned 500 — check the server logs and try again`                                         |
| HTTP 404 retrieving a resource            | Fail (throw)                                                                                          | `Could not retrieve <entity> — <service> returned 404 — verify the <id> exists`                                          |
| HTTP 429 rate-limited                     | Fail (throw)                                                                                          | `Could not complete request — <service> returned 429 (rate limited) — increase delay between calls or upgrade your plan` |
| Disk full                                 | Fail (throw)                                                                                          | `Could not write file — disk full — free up space in <path>`                                                             |
| User canceled mid-execution               | Fail (throw)                                                                                          | `<Action> canceled — user stopped the stream — no action needed`                                                         |
| Idempotent create finds existing resource | Fail (throw) OR Success (set a "Created/Existed" output to indicate which) — depending on user intent | —                                                                                                                        |


**Why not additional connectors for these?** Additional connectors are for *mid-execution emissions* — loop iterations, progress milestones, streaming chunks — see `additional-connectors.md`. A terminal outcome only happens once at the end; modeling it as a connector misleads users who'd otherwise correctly look at the Fail output for "did this work?".

When the user wants to handle a specific failure case differently in their stream, they can either inspect the error message on the Fail output (it's a string, parseable downstream if you keep the format consistent) or use a *Try/Catch*-style pattern at the stream level — both are Stream Designer affordances. They don't need a custom connector per error class.

## Anti-patterns

- **Bare exception messages.** `throw err;` propagates a stack-trace-laced message that confuses workflow engineers. Always re-throw with the three-part format.
- **Stack traces in user-facing messages.** They render as ugly wall-of-text in the UI. If you need the trace for debugging, `addNodeLog` it (mindful of credentials) — but don't put it in the thrown message.
- **Technical jargon without remediation.** "ECONNRESET" tells the user nothing. "Connection reset by server — retry or check your network" tells them what to do.
- **One-component messages.** `throw new Error("Failed")` — the user has no idea what failed, why, or what to do. House style requires all three components.
- **Inventing an error-output field** like `Output.ERROR_MESSAGE`. Don't. The engine surfaces the thrown message on the Fail output already. Adding a custom field just splits the API.
- **Try/catch that swallows.** `catch {}` or `catch (e) { return; }` hides failures from the workflow engineer; the node looks successful but produced no output. If you really want "swallow this specific error and continue", at minimum `addNodeLog` the swallowed message.
- **Treating cancellation as a generic failure.** Use the user-canceled message form above so the workflow engineer recognizes the cause and isn't alarmed.

## Curiosity hooks

- The three-part pattern is borrowed from "good error message" research in UX writing: the user needs to know *what broke*, *why it broke*, and *what to do next* — in that order. Generic stack traces fail all three.
- The em-dash convention (`—`) is intentional. It renders distinctively in the Stream Designer's failure-message panel and is easy to spot-check in screenshots. Don't substitute hyphens or pipes.
- The engine wraps unhandled errors in `node_modules/wave-engine/utils/NodeExecutor.js` — search for the `catch` block around `await this.node.execute()`. Worth a quick read if you're curious about the wrapping behavior.

