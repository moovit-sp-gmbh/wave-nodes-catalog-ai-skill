# Dependencies — first principles before pulling a package

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below. Newer engine and SDK majors exist and a first-party catalog may already pin one of them — never pin a `-dev` engine (`catalog-and-distribution.md`), and re-verify every stamped (engine) fact in this skill against whatever version is actually installed after any bump.

## When to use

Every time you're about to add an npm package to a catalog's `package.json`, or use one that's already there for a new purpose. Also when reviewing a node that pulls in a dependency you don't recognize.

## The principle

Most npm packages do more than you need. They drag in transitive dependencies, increase the bundle size the agent downloads, make engine upgrades harder, and bloat the catalog. **Before you add a dependency, reason from first principles about what you actually need.**

The default answer is "no". The justified answer is "yes, because X, Y, Z" — where X/Y/Z come from the test below.

## The four-question test

Walk through these in order. The first "yes" tells you what to do.

**1. Does the wave-engine already provide it?**

- HTTP requests → `this.wave.axiosHelper.makeRequest` (don't import axios directly).
- File operations → `this.wave.fileAndFolderHelper.*` (don't import `fs/promises` for things the helper covers).
- MD5 hashes → `this.wave.fileAndFolderHelper.getFileMd5Hash`.
- Curl conversion → `this.wave.axiosHelper.convertRequestToCurl`.
- Removing empty payload fields → `this.wave.axiosHelper.removeEmptyFields`.

If a helper exists, use it. Don't reimplement or reach for a different package.

**2. Is the Node.js standard library enough?**

This is the most under-used answer. Node's stdlib is huge and built-in. Examples of packages that are nearly always unnecessary:

| Tempting package | Use this instead |
|---|---|
| `crypto-js`, `node-forge` | `node:crypto` |
| `uuid` | `node:crypto.randomUUID()` |
| `lodash`, `underscore` | Native JS array/object methods. `Object.fromEntries`, `Object.entries`, `Array.prototype.flat`, etc. |
| `dotenv` | `node:fs.readFileSync` + parse, or env-var convention |
| `node-fetch` | `globalThis.fetch` (built-in since Node 18) or `wave.axiosHelper` |
| `path-to-regexp` | A 20-line regex if your routing is simple |
| `slugify` | `value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+\|-+$/g, "")` |
| `date-fns`, `moment` | `Intl.DateTimeFormat` for formatting; native `Date` arithmetic; `node:util.parseArgs` for ISO parsing |
| `pino`, `winston` | `wave.logger.*` for node-internal logging |

**3. Can I implement the slice I actually need in 30–50 lines?**

If the answer is yes, do that. A short, focused implementation:

- Has zero transitive dependencies.
- Is easy to read, easy to debug, easy to test.
- Won't break when the package author rewrites the API.
- Keeps the catalog small.

The corollary: if the slice you need is 200+ lines, complex, security-sensitive, or covers many edge cases — *that's* when you might be looking at the right kind of package.

**Concrete examples of "reimplement it":**

- A CSV-row parser handling quoted fields → ~40 lines of state machine.
- A simple template engine for `{{name}}` substitution → ~10 lines.
- A backoff-retry helper → ~20 lines.
- A simple JSON-pointer resolver → ~15 lines.

**4. Is the package a well-tested standard the catalog should rely on?**

The yes cases. These are where packages earn their keep:

- **Cryptography primitives** beyond what `node:crypto` covers: well-known JWT implementations (`jose`), JWS/JWE, signature verification libraries.
- **Spec parsers** for hairy formats: YAML (`js-yaml`), XML, OpenAPI (`@redocly/openapi-core`), SOAP envelopes, ICS calendar files, RFC2822 email.
- **Provider SDKs**: `@aws-sdk/*`, `@azure/*`, `@google-cloud/*`, vendor-specific JS clients for major SaaS. Building these yourself is folly.
- **Schema validation** when you need it: `ajv` for JSON Schema, `zod` for TypeScript-native.
- **Stream/binary protocols** where the format is non-trivial: tar, zip, gzip beyond `node:zlib`'s simple cases.
- **Tightly-coupled tooling** the wave-engine itself needs: `axios` (the wave-engine runtime exposes the axios helper, so importing axios in a catalog node is OK and consistent).

If the dependency falls into one of these categories, add it. Document the decision in your PR / commit message.

## What's currently in the blueprint

The blueprint's `package.json` already pins:

- `axios` — HTTP. Wrapped by `wave.axiosHelper`; available directly if you need lower-level access.
- `hcloud-sdk` — used for every helmut.cloud interaction.
- `wave-engine` — the runtime.
- `js-yaml` — YAML parsing (justified — YAML is non-trivial to parse correctly).
- `tar` — TAR archive handling (justified — also non-trivial).

These are precedents. Adding to this set raises the bar.

## How to grow the dep set responsibly

**Before adding:**

1. Fetch the package's README and changelog. Confirm it's maintained (commits in the last year), well-tested (high download count, used in well-known projects), and security-clean (no recent CVEs).
2. Check the dependency tree: `npm view <pkg> dependencies`. If it pulls 30 transitives, that's a signal.
3. Pin a specific version in `package.json`, not a range. Catalogs are versioned bundles; reproducibility matters.
4. Add a line to the changelog explaining the new dep: *"add `jose@5.x` for JWT verification — required by the OAuth flow in Authenticate User"*.

**After adding:**

- Bundle and inspect. `npm run bundle` produces `bundle.js`. Look at its size. If it grew by 2 MB for a package you needed 50 lines of, reconsider.
- Re-run lint + typecheck + tests. New deps sometimes pull in conflicting types.

## Anti-patterns

- **`lodash.everything`.** A single `_.get(obj, "a.b.c")` is a 5-line helper or a few `?.` operators. Pulling lodash adds 600KB of transitive bloat.
- **Using packages for what's already in the engine helpers.** Importing `axios` directly when you could use `this.wave.axiosHelper.makeRequest`. Both work; the latter is consistent with the rest of the catalog.
- **Pulling a multi-megabyte SDK to use one function.** If you need to compute an HMAC signature for AWS, the cost of `@aws-sdk/signature-v4` may not be worth it — `node:crypto` + 40 lines of signing logic might be cleaner. Decide case by case.
- **Adding a dep without justifying it in the changelog.** Future you will want to know why.
- **Float version ranges (`^1.2.3`) in catalogs.** Pin specifics. Catalogs are immutable artifacts; reproducibility is the whole point.
- **Importing a package that wraps a package the engine already wraps.** E.g., adding `got` or `node-fetch` when `axios` (via `wave.axiosHelper`) is the catalog convention. Pick one.

## Curiosity hooks

- The wave-engine's helpers were built precisely to remove the most common catalog deps. If you find yourself reaching for one that the engine *should* have, that's signal to suggest an engine-side addition (file a request) rather than working around it with a one-off package.
- The Node.js standard library has grown enormously. `node:util.parseArgs`, `node:test`, `node:stream/web`, `Intl.*`, native `fetch`, `randomUUID`, `URL`/`URLSearchParams` — most of what older catalogs reach into npm for is built in now.
- Bundle size matters operationally: the helmut.cloud Agent downloads catalog bundles to a local cache. Big bundles = slower cold-starts on the user's machine. A lean catalog is a better catalog.
