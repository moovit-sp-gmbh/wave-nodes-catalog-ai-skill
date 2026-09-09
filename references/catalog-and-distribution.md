# Catalog and distribution

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## What a catalog is (user-facing)

A **catalog** is the deliverable that ships your nodes to helmut.cloud. Three roles interact with it: **space admins** install it into a helmut.cloud space (via *Manage node catalogs → Add external catalog*) and update it when new versions land; **catalog authors** (the user this skill talks to) version and publish it; **workflow engineers** see the catalog as one named group in Stream Designer's node panel and drag nodes from it onto the canvas when building streams. From the repo's perspective, it's a `new Catalog(name, description, logoUrl, minimumEngineVersion, ...nodes)` call in `index.ts` that bundles every node you authored into one publishable artifact.

The skill's **Step 1e** (in `SKILL.md`) settles the catalog's name and description with the user before any node scaffolding begins, so the registration step at the bottom of `index.ts` is never written against a stub.

## When to use

When wiring `index.ts` to register a new node, when setting catalog metadata, when packaging a catalog for distribution, when explaining to the user where their catalog lives once published.

## The `Catalog` constructor

`lib/Catalog.ts` exposes a simple registry class. The blueprint's `index.ts` instantiates it:

```typescript
import Catalog from "./lib/Catalog";
import HttpClient from "./lib/nodes/HttpClient";
import MyNode from "./lib/nodes/MyNode";

export default new Catalog(
    "My Catalog",                                          // name (shown in Stream Designer)
    "Nodes for my custom workflows",                       // description
    "https://example.com/my-logo.webp",                    // logoUrl (.webp, publicly accessible)
    "1.0.0",                                               // minimumEngineVersion — the lowest wave-engine your catalog supports
    HttpClient,
    MyNode,                                                // nodes are passed as varargs
);
```

**Constructor signature** (from the blueprint's own `lib/Catalog.ts`, which every catalog author has):

```typescript
constructor(name: string, description: string, logoUrl: string, minimumEngineVersion: string, ...nodes: (new () => Node)[])
```

The parameter names are `logoUrl` and `minimumEngineVersion` (not `logo` / `minEngineVersion`) — they're also the class's public property names. There is no exported `NodeClass` type; the constructor's varargs are typed `(new () => Node)[]` directly against the blueprint's own `Node` class.

**Notes on each field:**

- `**name`** — short, human-readable. House style: max ~40 chars. Renders in the Stream Designer's catalog list. **Settled in SKILL.md Step 1e with the user** — don't change it after that without asking. Renaming after a published release is a catalog-identity change workflow engineers may not expect.
- `**description`** — one sentence, ≤ 120 chars, present tense, action-focused, jargon-free. See "Catalog description rules" below for the full set of constraints, forbidden words, and worked examples. The user reads this when browsing catalogs in Stream Designer's **Manage node catalogs**. **Settled in SKILL.md Step 1e** with a propose-and-confirm prompt; user can override freely.
- **`logoUrl`** — must be a publicly-accessible URL serving a `.webp` file. The catalog author provides their own hosting (their own CDN, object storage, GitHub Pages, etc.) — see "Publish to S3" below for what the author needs to supply. Use a stable URL. The pixel dimensions are not formally enforced; common sizes in the wild are 96×96 or 128×128. If the user needs an authoritative answer, ask them to check Stream Designer or confirm with MoovIT — `docs.helmut.cloud` is not currently a reliable source for agent queries.
- `**minimumEngineVersion**` — the version the catalog author intends to target (Step 2 of the SKILL.md workflow). No enforcement of this field was found anywhere in the wave-engine or Agent source this skill was verified against — treat it as **declarative metadata** the author is responsible for keeping honest, not an engine-enforced gate. **Never set this to a `-dev` version** — see the warning below.
- `**...nodes`** — every node class you want this catalog to expose. The constructor builds a `nodeCatalog` map keyed by class name.

## Catalog description rules `[House style, MUST]`

The catalog `description` field renders in Stream Designer's **Manage node catalogs** list, next to the catalog name and logo. The reader is a workflow engineer browsing for "what can I build with this?" — not a buyer comparing products and not a developer evaluating an SDK. The description **MUST** speak in plain language about the actions the user can take with this catalog, in words they would use themselves.

### Required

- **One sentence**, ≤ 120 chars hard cap, ≤ ~90 chars recommended
- **Present tense**, declarative
- **Opens with action verbs the user would say**: *create*, *update*, *send*, *look up*, *list*, *post*, *close*, *upload*, *delete*, *track*, *manage*, *read*
- **Uses entity nouns the user already knows**: *tasks*, *tickets*, *messages*, *channels*, *issues*, *contacts*, *files*, *records*
- **Names the product/domain at the end** (so the description reads actions-first, product-as-context)

### Forbidden — `[MUST NOT]`

The agent **MUST NOT** include any of the following in a catalog description. If any of these appear in a proposed description, treat the proposal as failed and rewrite.

**1. Marketing adjectives.** These add no information and signal a marketing-copy register.

- *powerful, comprehensive, seamless, robust, enterprise-grade, best-in-class, feature-rich, complete, full-featured, advanced, intuitive, modern, world-class, industry-leading*

**2. Vague benefit verbs.** These describe outcomes in abstract terms instead of concrete user actions.

- *automate, streamline, supercharge, empower, unlock, enable, leverage, harness, drive, transform, accelerate*
- *integrate with* (when used as a synonym for "use" — say what the user can do, not that the catalog "integrates")

**3. Infrastructure / implementation jargon.** The description ships to a workflow engineer who doesn't care how the catalog is built. They care what it does.

- *API, REST, REST API, endpoint, webhook, OAuth, API key, token, credential, SDK, wrapper, integration, GraphQL, gRPC, HTTP, JSON, request, response, payload*

**4. Meta-platform references.** The description renders inside Stream Designer. Telling the reader where it ships is redundant noise.

- *"from helmut.cloud streams", "for the helmut.cloud platform", "in Stream Designer", "via wave-engine", "for the helmut.cloud Agent"*

**5. Self-reference.** Wastes characters before the verbs the reader cares about.

- *"This catalog…", "A collection of nodes for…", "Nodes for…", "Provides nodes that…"*

### Worked examples

| Bad | Why it fails | Good |
|---|---|---|
| *"Powerful workflow automation for your ClickUp workspace with seamless API integration"* | marketing adjectives + vague benefit verb + infrastructure jargon | *"Create, update, and look up tasks in ClickUp"* |
| *"Comprehensive integration with the Jitbit REST API including OAuth authentication and webhook support"* | marketing + infrastructure jargon | *"Open tickets, post replies, and close them out in Jitbit"* |
| *"Nodes for automating Slack from helmut.cloud streams"* | self-reference + vague benefit verb + meta-platform | *"Send messages, read channels, and manage users in Slack"* |
| *"Feature-rich Linear catalog with API key authentication"* | marketing + infrastructure | *"Track issues and projects in Linear"* |
| *"This catalog provides comprehensive access to GitHub's REST API for repository management"* | self-reference + marketing + infrastructure | *"Create issues, review pull requests, and manage repos in GitHub"* |
| *"Empower your team to leverage HubSpot's full feature set through our intuitive node library"* | every category — marketing, vague verbs, self-reference | *"Manage contacts, deals, and tickets in HubSpot"* |

### Heuristic

If you removed every word in the description and asked the reader *"what can I do with this catalog?"*, the answer should reconstruct the description almost verbatim. If the description could equally describe any catalog in the same space (a generic "powerful integration with X"), it fails the test. The description's job is to be **specific** about actions, not **enthusiastic** about possibilities.

### When the catalog wraps something other than a SaaS

The same rules apply. For a catalog of pure transforms (parsing, hashing, format conversion), name the transforms instead of API actions:

- Good: *"Parse CSV rows, compute hashes, and convert between date formats"*
- Bad: *"Powerful data manipulation toolkit"* (marketing, no specifics)

For a catalog of OS/file operations:

- Good: *"Read, write, copy, move, and watch files on the local filesystem"*
- Bad: *"Robust file system integration"* (marketing, infrastructure-flavored)

## Picking the wave-engine target version

This decision determines (a) which `StreamNodeSpecification` versions are usable, (b) which `this.wave.*` helpers are available, (c) which `{{wildcards}}` resolve, and (d) what users' helmut.cloud spaces must be running to use the catalog at all. Make it once, up front.

**Rules of thumb:**

1. **Target the newest *production* engine** the catalog's users can deploy. New production engines bring the latest spec versions, helper methods, and wildcards.
2. **Verify the deployment side can support it.** Ask the user: "Is the helmut.cloud space where this catalog will run on engine version X or can it be upgraded? If not, target the older version it's actually on." A catalog that uses helpers, spec versions, or wildcards a space's actual engine doesn't have will fail to load or misbehave at runtime — `minimumEngineVersion` itself is declarative metadata (see the constructor notes above), so this is about real compatibility, not a field the platform checks for you.
3. **Never target a `-dev` engine.** Production catalogs are versioned artifacts that get cached and re-served — dev engines aren't built for that lifecycle. Specifically:
  - **Dev engines are deleted periodically.** MoovIT prunes them; a catalog built against `2.4.0-dev-5` may stop loading without warning when that engine is removed.
  - **APIs may change without notice.** Dev versions iterate on the helper surface, the spec types, the wildcard set. A feature you depend on in `-dev-3` may be renamed or removed by `-dev-6`.
  - **Features may be reworked or removed.** Things that exist in dev sometimes don't ship to the next production release.
  - **Bugs.** Dev versions are for testing — by definition, they're not stable.
   If the user really wants to build against dev (only valid case: they're testing an upcoming production feature against a known-temporary engine), warn them explicitly, mark the catalog as experimental, and plan a migration to the production release the moment it lands.

**Concrete flow.** Prefer opening `package.json` and `node_modules/wave-engine/package.json` directly — it's the most reliable path because it doesn't depend on the user's shell at all. When a shell command is unavoidable, use `node` (always present in a wave-node project) instead of `cat | jq` — `jq` is not installed by default on macOS or Windows, and the Unix-shell quoting (`'.dependencies."wave-engine"'`) breaks on Windows CMD/PowerShell.

```bash
# 1. Check the declared dependency — cross-platform, no jq needed
node -e "console.log(require('./package.json').dependencies?.['wave-engine'] ?? 'not declared')"

# 2. Check what's actually installed
node -e "try { console.log(require('./node_modules/wave-engine/package.json').version) } catch { console.log('not installed') }"

# 3. If outdated or absent, install the target version
npm install wave-engine@<target-version> --save

# 4. Verify after install
node -e "console.log(require('./node_modules/wave-engine/package.json').version)"
```

`npm install` and `node -e` run identically on Linux, macOS, and Windows; `cat` / `ls` / `jq` / `$_` do not.

Then set `minimumEngineVersion` in `index.ts` to the same version, and design against the helpers, wildcards, and spec types actually present in `node_modules/wave-engine/`.

## `index.ts` — the registration step

After scaffolding a node, two edits to `index.ts`:

1. Add the import at the top:
  ```typescript
   import MyNode from "./lib/nodes/MyNode";
  ```
2. Add the node to the `Catalog(...)` varargs at the bottom:
  ```typescript
   export default new Catalog(
       "My Catalog",
       "...",
       "...",
       "1.0.0",
       HttpClient,
       MyNode,         // ← here
   );
  ```

That's it. The class name (`MyNode`) becomes the lookup key in the catalog's internal map and is what the Stream Designer references when wiring streams.

## Domain helpers — extract them

When a catalog wraps an external system (an API, a CLI tool, a SaaS product), **extract a single stateless helper class under `lib/helpers/`** that hides the transport details. Every node in the catalog imports and delegates to it.

```
lib/
├── Catalog.ts
├── Node.ts
├── helpers/
│   └── jitbit-client.ts        # one stateless class wrapping the Jitbit API
└── nodes/
    ├── CreateTicket.ts          # delegates to JitbitClient
    ├── UpdateTicket.ts          # delegates to JitbitClient
    ├── GetTicket.ts
    └── ListTickets.ts
```

**Why this matters:**

- Avoids 90% duplication across thin endpoint-wrapper nodes.
- Centralizes auth, retry, error translation, URL building.
- Lets you unit-test the helper without booting the wave-engine.
- Catalog upgrades (Jitbit moves to v2) become a one-file change instead of one-per-node.

The helper class should be **stateless** — its constructor takes credentials/config and that's it. Each node instantiates a fresh one in `execute()`. Don't share instances across executions.

## Catalog metadata files

The customer-facing pieces of a catalog repository:

- `**README.md`** — explains what the catalog is for, how to install/configure. Stream Designer doesn't render it; this is for GitHub readers.
- `**changelog.json**` — machine-readable catalog-wide changelog. See `changelog-and-versioning.md`.
- `**changelog-howTo.md**` — the in-repo guide for changelog entries. Already present in the blueprint.
- `**assets/**` — typically a `logo.webp` or screenshots. Hosted via GitHub Pages or a separate CDN — the URL needs to be reachable from the Agent.

The catalog metadata lives in the `Catalog(...)` constructor call.

## Build pipeline

```bash
npm run bundle      # esbuild → bundle.js (CommonJS, single file)
npm run bundle:debug   # same + sourcemaps for breakpoints
npm run build       # bundle + extract per-node specs via scripts/build.mjs
npm run spec -- MyNode   # bundle + serialize one node's spec to stdout
```

`**bundle.js**` is the artifact that gets uploaded to S3. It contains every node, every helper, and (statically-linked) every npm dependency you imported. This is why dependency size matters (see `dependencies.md`).

**Never commit build artifacts or transient files.** `bundle.js`, `bundle.js.map`, and anything else `npm run bundle` / `npm run build` produces are generated outputs — the GitHub Actions publish workflow rebuilds them on tag, so committing them only invites stale-bundle bugs and noisy diffs. They belong in `.gitignore`, not in commits. The same applies to stray files left over from refactors (an old `ActionNode.ts` after renaming to `Action.ts`, half-deleted scratch files, editor backups, `.orig` / `.bak` files from merge tools). Before `git commit`, run `git status` and reconcile every untracked or modified file — if you can't explain why it's there, delete it.

## Publish to S3 (author-provided bucket)

The blueprint ships a GitHub Actions workflow at `.github/workflows/upload-to-s3.yaml` (note the `.yaml` extension) that triggers on any `v*` tag push. Reading the file itself (every catalog author has it) is the ground truth; here's what it actually does:

1. `npm ci`, then `npm run bundle` (esbuild → `bundle.js`) and `npm run build` (aggregates per-node specs).
2. Extracts `name`, `description`, `logoUrl`, and `minimumEngineVersion` straight from the bundled `Catalog` instance (`require("./bundle.js").default.<field>`) — these come from your `index.ts`, not from secrets.
3. Extracts the release `version` from the pushed tag (strips the leading `v`; fails the workflow if the tag doesn't start with `v`).
4. Runs `scripts/check-changelog.mjs <version>` (fails if `changelog.json`'s top entry doesn't match the tag) and `scripts/convert-changelog.mjs`.
5. Assembles an `upload/` folder: `bundle.js`, `specification.json`, the converted `changelog.json`, and every `lib/nodes/*.md` wavedoc copied into `upload/docs/`.
6. Uploads via `moovit-sp-gmbh/hcloud-catalog-upload-action@v1.1.1`, passing `endpoint`, `bucket`, `public_endpoint`, `region`, `dest_dir` as **plain placeholder values in the workflow file** (`<S3 endpoint>`, `<name of your S3 bucket>`, etc. — the author edits these directly, they are not secrets), plus `access_key_id`/`secret_access_key` sourced from **exactly two** GitHub Actions secrets (named whatever the author configured — the workflow file references `${{ secrets.<secret set in the GH repo> }}` as a placeholder), `name`/`description`/`logo`/`minimum_engine_version`/`version` from steps 2–3, `source_dir: upload`, and `on_fail: delete`.
7. Prints `${{ steps.upload.outputs.url }}/index.json` — the catalog registry URL to paste into Stream Designer's **Add external catalog**.

**Dependencies come from the public npm registry only.** `hcloud-sdk` and `wave-engine` are published unscoped on npmjs.com (verified 2026-09-07: `hcloud-sdk` 22.28.0, `wave-engine` 3.0.0). A catalog must never depend on a private `@moovit-sp-gmbh/*` package, and the release workflow needs no registry authentication — if an existing workflow carries `.npmrc` steps writing a GitHub Packages token and an `@moovit-sp-gmbh` scope, they are leftovers from an older setup; remove them rather than reproducing them in a new catalog.

**Setup (one-time per catalog) — the author provides the bucket.** This skill never assumes a Helmut-managed or shared bucket. The catalog author supplies their own S3-compatible bucket endpoint, bucket name, public read endpoint, and region (edited straight into the workflow file's placeholders) plus an access key ID and a secret access key (the only two values that go into GitHub Actions secrets). **The skill's job is to ask the author for these four plain values and the two keys — never invent an endpoint, bucket name, or region.** Don't assume a fixed set of secret *names* either; the workflow file only needs `secrets.<whatever the author named them>` to resolve to the right values.

**Per-release:**

```bash
git add .
git commit -m "feat: add MyNode"
git tag v1.2.0
git push origin v1.2.0   # triggers the workflow
```

The workflow bundles, builds, and uploads `bundle.js`, `specification.json`, `changelog.json`, and the per-node wavedocs to the author's bucket under `<dest_dir>/<version>/`. The workflow logs print the public registry URL to copy.

## Import into Stream Designer

Once published:

1. In Stream Designer: **Manage node catalogs** → **Add external catalog**.
2. Paste the registry URL the workflow printed — always the `index.json`, e.g. `https://your-public-endpoint/catalogs/catalog-name/index.json`. That file lists every published version as `{version, url, minimumEngineVersion}`; Stream Designer reads it and hands the Agent one `{url, version}` pair, and the Agent then fetches `<url>/<version>/bundle.js` (verified against `hcloud-agent-dev/backend/src/helper/WaveManager.ts`, `downloadCatalogs`).
3. Save. The catalog appears in the Stream Designer's node panel for streams in that organization/space.

The Agent caches downloaded catalogs locally under `${engineFolder}/catalogs/<md5>/bundle.js` where `<md5>` is the MD5 of the URL + version. This means cache busting is automatic on version bumps; same version = same cache hit.

**How a customer picks up a new version (verified against hcloud-sdk `service/high5/wave/s3` and `service/high5/space/wave`).** Nothing updates on its own. The space stores one `{url, version, minimumEngineVersion}` per catalog (`SpacePatchWaveCatalog`, written by `POST /v1/org/<org>/spaces/<space>/wave/catalog`). Stream Designer re-reads the catalog's `index.json` to list the published versions; a space admin opens *Manage node catalogs* and selects the new version, which rewrites that record. From then on new executions carry the new `{url, version}` in their execution package and the Agent downloads `<url>/<version>/bundle.js` once. Existing streams keep the catalog version their nodes were saved with (`StreamNode.catalog`), which is why a breaking change goes into a duplicated `V<n>` node rather than an edit in place — see `changelog-and-versioning.md`. So the release message to the customer is: "version X.Y.Z is published; select it under Manage node catalogs in each space that should use it."

## Anti-patterns

- **Forgetting to import + add to the `Catalog(...)` varargs.** The node compiles and lints fine — but `npm run spec -- <NodeName>` does **not** silently succeed: `scripts/spec.mjs` looks the class up as `new catalog.nodeCatalog[nodeName]()`, and an unregistered name means `catalog.nodeCatalog[nodeName]` is `undefined`, so the script throws `TypeError: catalog.nodeCatalog[nodeName] is not a constructor`. That error is actually a useful signal that registration was skipped — but the node still won't appear in Stream Designer until you register it. Always grep `index.ts` for the new class name after scaffolding.
- **Sharing a domain helper instance across executions** via module-level state. Each `execute()` should construct its own. Module state across executions is a debugging nightmare.
- **Hard-coding the base URL of the wrapped service inside the helper.** Take it as a constructor parameter; the nodes read it from a `<Product> URL` input. Users may need to point to a non-default deployment.
- `**logoUrl` that requires authentication.** Stream Designer fetches it from the user's browser; private URLs fail to render.
- `**minimumEngineVersion` left at `1.0.0` forever.** Bump when you start using a newer engine feature.
- `**minimumEngineVersion` still set to a `-dev-N` engine at merge time.** Dev engines are pruned on a cadence by MoovIT and APIs can shift between dev builds. Published catalogs need a released floor. If you targeted a `-dev` engine during development to test an upcoming feature, swap to the corresponding production release before merging — catalogs with a `-dev` floor stop loading the day that engine is removed.
- **Floating S3 paths** without version segmentation. Old versions get overwritten; users on older catalogs break. Always include the version in the S3 path.

## Curiosity hooks

- The Agent caches at `${engineFolder}/catalogs/<md5>/bundle.js`. If a customer's Agent seems to ignore a new catalog version, clearing this cache forces a fresh download.
- The build script at `scripts/build.mjs` bundles then introspects the bundled module to extract per-node specs. The output is what Stream Designer reads via the spec endpoint — useful when troubleshooting "why doesn't my new input appear?".
- The `Catalog` constructor stores nodes in a `nodeCatalog` map keyed by class name (not the spec's `name` field). Rename the class → rename the catalog entry. The spec `name` is purely UI.

