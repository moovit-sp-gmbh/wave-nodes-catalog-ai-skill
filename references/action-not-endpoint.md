# Action, not endpoint

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Every time you're about to scaffold a node — apply this lens *before* picking inputs and outputs. Also: any time the user describes a task that obviously involves multiple API calls, multiple CLI invocations, or a mix of operations to achieve one outcome.

## The principle

A node is a **user-meaningful action**, not a thin wrapper around one API call. The job of a node author is to *reason about what the user is trying to accomplish* and let that drive the design — not let the underlying transport (REST, gRPC, CLI, stdlib, npm package) drive it.

**Three quick examples:**

| User says | Endpoint-shaped (don't) | Action-shaped (do) |
|---|---|---|
| "Upload a video to Vimeo" | 5 nodes: *Get Upload URL* → *Init Upload* → *Upload Chunk* → *Finalize* → *Get Status* | One node: **Upload Video** that does all five internally. |
| "Provision a database with seed data" | 3 nodes: *Create DB* → *Run Migrations* → *Insert Seed Data* | One node: **Provision Database** with `seed: BOOLEAN` and `migrations: STRING_LIST` inputs. |
| "Notify team channel about a release" | 4 nodes: *Get Channel ID* → *Format Message* → *Post Message* → *Pin Message* | One node: **Notify Release** with a `pin: BOOLEAN` advanced input. |

The user's mental model is *"I want to upload a video"*. The transport details are implementation. When you mirror the transport in the node graph, every user reinvents the same five-step chain — and every catalog becomes a swamp of copy-paste.

## The forcing-function checklist

Before scaffolding, ask yourself — silently or out loud:

1. **What is the user trying to do?** Restate it as a noun-led action: "upload a video", "send a notification", "extract data from a PDF".
2. **Can this be one node?** If the action has a clear start, end, and outcome — usually yes.
3. **What's the cost of splitting?** Five chained nodes means: five UI tiles to drag, four wildcard bindings to wire, four failure surfaces, and every user who does this action will repeat the same plumbing.
4. **What's the cost of composing?** One node with more inputs, slightly larger `execute()`, more failure causes to enumerate. Usually less than the cost of splitting.
5. **Is there a real reason to split?** Sometimes yes:
   - **Reuse**: if step 2 is genuinely independent and other streams will use it on its own.
   - **User control**: if some users need to inspect/modify intermediate state.
   - **Branching**: if step 3 needs to fan out to N parallel things, not always 1.
   - **Backpressure or batching**: if intermediate state must be buffered before continuing.

If none of these apply, compose.

## When to compose: a worked example

User says: *"I need a node that uploads an image to our CDN and returns its public URL."*

Naive endpoint-shaped read: this is `POST /v1/uploads/init` → `PUT <signed-url>` → `POST /v1/uploads/<id>/finalize` → `GET /v1/uploads/<id>` → return URL. Four nodes.

Action-shaped read: this is **"upload an image"**. One node. Inputs are *Source path* (STRING), *MIME type* (STRING_SELECT, optional, advanced), *API key* (STRING_PASSWORD). Output is *Public URL* (STRING). The four API calls happen inside `execute()`:

```typescript
async execute(): Promise<void> {
    const sourcePath = this.wave.inputs.getInputValueByInputName(Input.SOURCE_PATH) as string;
    const apiKey = this.wave.inputs.getInputValueByInputName(Input.API_KEY) as string;

    const init = await this.initUpload(apiKey);
    await this.uploadChunks(sourcePath, init.signedUrl);
    await this.finalize(init.id, apiKey);
    const url = await this.fetchPublicUrl(init.id, apiKey);

    this.wave.outputs.setOutput(Output.PUBLIC_URL, url);
}
```

Each of `initUpload`, `uploadChunks`, `finalize`, `fetchPublicUrl` is a private method, individually testable with Jest. The user sees one *Upload Image* tile.

## When to split: a worked counter-example

User says: *"Build nodes around our customer API."*

If the API has `GET /customers`, `POST /customers`, `GET /customers/:id`, `PATCH /customers/:id`, `DELETE /customers/:id`, splitting into *List Customers*, *Create Customer*, *Get Customer*, *Update Customer*, *Delete Customer* is the right call — each is its own action, used independently. There's no single composed action that means "manage a customer".

The rule isn't "always compose". It's "compose when the user mental-models it as one action; split when the user mental-models it as separate actions".

## Anti-patterns

- **The endpoint-per-call trap**: one node per REST verb against the same resource, producing N nearly-identical thin wrappers with 90% duplicated input fields (auth, base URL, headers, retries). Symptom: your catalog has 11 nodes that are 160 lines each and 130 of those lines are identical between them. Fix: extract a single domain helper class under `lib/helpers/` and shrink each node to the action it represents.
- **The over-decomposition trap**: splitting one logical action into 4 nodes because each step "feels" reusable in theory. Reality: nobody reuses them; every stream chains the same 4 in the same order. Compose.
- **The mega-node trap**: a single "Cloud Manager" node with 60 inputs and a `STRING_SELECT` action picker that secretly dispatches to 12 unrelated operations. This isn't action-shaped, it's chaos. Each operation has its own inputs and outputs — keep them separate. *(How to tell: if the `STRING_SELECT` switches on something where >50% of the other inputs become irrelevant for any given choice, it's a mega-node. Split it.)*
- **Mirroring CLI flag granularity**: wrapping `docker run` by exposing 35 flags as 35 inputs. Most users need 4. Make the 4 mandatory/visible, the rest advanced. Better: split into *Run Container* (common case) and a separate *Run Container (Advanced)* if absolutely needed.

## Curiosity hooks

- Why does this matter for catalog quality? Because users compose nodes visually, every additional node in a chain is a UX tax: a tile to drag, a connection to draw, an input panel to fill. Composed nodes amortize that tax over their lifetime.
- When a node *does* end up large (15+ inputs is a soft warning), look at the *Run Docker Container*-style action: it composes a half-dozen lifecycle calls and exposes ~11 inputs, with about half marked `advanced`. That's a healthy shape. The cap isn't "small node = good"; it's "right-sized to one user-meaningful action".
- This principle is not OpenAPI-specific. It applies just as much to wrapping a CLI (`docker run` is *running a container*, not *running an executable*), to stdlib operations ("hash a file" is one node even though it's a stream + a digest + a hex encoding), and to package wrappers (don't expose each package method as its own node — pick the actions users care about).
