# Wildcards and stream variables

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

When a node's input value depends on data produced earlier in the stream. When you need to read execution-level context (org, space, agent info). When debugging why an input arrives as something other than what the user typed.

## Concept

Inputs in the Stream Designer accept literal values *or* wildcards — small `{{...}}` templates the engine resolves before your node runs. The resolved value is what arrives in your `execute()` via `wave.inputs.getInputValueByInputName`. Source for the resolver: `node_modules/wave-engine/utils/WildcardResolver.js` (190 lines, worth a direct read — there is no separate `.d.ts`-only summary).

**Resolution happens before `execute()`.** If you call `getInputValueByInputName`, the value is already resolved. The original template (with `{{...}}` intact) is available via `getInputOriginalValueByInputName` if you need it.

## The mini-language `(engine, verified 2.0.1)`

**A newer engine may change this section.** The facts below describe the resolver actually installed at `node_modules/wave-engine/utils/WildcardResolver.js` for wave-engine 2.0.1. An engine checkout that is ahead of what the blueprint installs is known to differ (lowercase-only scopes instead of case-insensitive matching, an added `hcloud` scope, and backslash escaping) — if `scripts/check-env.mjs` reports a different wave-engine version, re-read the resolver source before relying on any of this.

**Mechanics:**

- The regex `/{{([^{}]+?)}}/g` finds every `{{...}}` span and resolves it, substituting the result back into the string and repeating until no `{{` remains.
- Up to **100** nested resolution passes (`WildcardResolver.MAX_WILDCARD_NESTINGS`); exceeding that throws `"Exceeded the maximum number of wildcard replacements allowed"`. If you're nesting more than a few wildcards, the design is probably wrong — split the work across nodes.
- An unresolvable wildcard **throws** `"Unable to resolve wildcard: {{<wildcard>}}"` — it does not silently pass the literal text through.
- **There is no backslash-escaping mechanism in 2.0.1.** A literal `{{` in data (e.g. inside a JSON payload the node receives) cannot be protected from a resolution attempt — if it happens to parse as a wildcard path, the resolver will try to resolve it and may throw.

**Top-level scopes** — the resolver reads everything before the first `.` and upper-cases it, so **`AGENT`/`agent`, `STREAM`/`stream`, `NODE`/`node`, `OUTPUT`/`output`, `PAYLOAD`/`payload`, and `VARIABLE`/`variable` are all matched case-insensitively.** There is **no `hcloud` scope** in 2.0.1 — `{{hcloud.organization.id}}`-style wildcards do not exist here (a newer engine may add one; verify against the installed resolver before relying on it).

| Wildcard | Resolves to |
|---|---|
| `{{PAYLOAD}}` / `{{payload.<jsonPath>}}` | The stream's payload data (`streamResult.payload.data`), optionally drilled into via a JSON path |
| `{{AGENT.info}}` / `{{agent.info.<jsonPath>}}` | The running Agent's info object (OS, CPU, hostname, memory, nics, agent version — see `StreamRunner#setAgentInfo`), optionally drilled into |
| `{{STREAM.info}}` / `{{stream.info.<jsonPath>}}` | The stream execution's own `info` object, optionally drilled into |
| `{{VARIABLE.<name>}}` | The named stream variable. **Throws** `"Stream variable '<name>' does not exist"` if the variable is missing or falsy |
| `{{OUTPUT.<uuid>.<outputName>}}` / `{{OUTPUT.<uuid>.<outputName>.<jsonPath>}}` | A previous node's named output (matched case-insensitively by name), optionally drilled into via a JSON path |
| `{{NODE.<uuid>.INPUT.<name>[.jsonPath]}}` | The named input's resolved value on a specific node result |
| `{{NODE.<uuid>.OUTPUT.<name>[.jsonPath]}}` | Same as the `OUTPUT.<uuid>.<name>` form above, addressed through the `NODE` scope instead |
| `{{NODE.<uuid>.ERROR[.jsonPath]}}` | That node's `StreamNodeResultError`, if it failed |
| `{{NODE.<uuid>.ERRORS}}` | Array of error messages from that node's *failed input validations* (not the node's own execution error) |
| `{{NODE.<uuid>.LOGS[.jsonPath]}}` | That node's log lines |
| `{{NODE.<uuid>.INFO[.jsonPath]}}` | That node's `NodeInfo` — `runTime` and `catalog.{name?, _id?, url, version}`. See "Run time and catalog metadata are wildcard-reachable" below |

Every sub-keyword (`INPUT`, `OUTPUT`, `ERROR`, `ERRORS`, `LOGS`, `INFO`) is also matched case-insensitively, same as the top-level scope.

**`{{OUTPUT.<uuid>.input.X}}` is wrong.** There is no `input` sub-path under the `OUTPUT` scope — that form looks for an output literally *named* `"input"` on the given node and will not find one (or will resolve to the wrong thing if such an output happens to exist). To read an upstream node's *input* value, use the `NODE` scope: `{{node.<uuid>.input.X}}`.

### Run time and catalog metadata are wildcard-reachable

`node.<uuid>.info.runTime` and `node.<uuid>.info.catalog.{name,_id,url,version}` **are** reachable via wildcard — the resolver's `INFO` case returns the node result's `info` object as-is (optionally drilled into with a JSON path), and that object's shape (`NodeInfo`) is declared in `node_modules/hcloud-sdk/lib/interfaces/high5/space/event/stream/node/index.d.ts` as `{ runTime: number; catalog: { name?: string; _id?: string; url: string; version: string } }`. This is why a node should never declare its own `Run time` output — the platform already records it per node result and exposes it through this wildcard; see `references/naming-and-style.md`.

## Stream variables — read-only from a node's perspective

`{{variable.<name>}}` reads stream-scoped state that the user configures at the stream level. **A node cannot mutate a variable from inside `execute()`** — there is no `wave.general.setVariable(...)` or equivalent on the public surface (confirmed against `node_modules/wave-engine/helpers/Wave.d.ts`, class `General`).

If your design *needs* mutable cross-node state, the supported approach is: read inputs, write outputs, let downstream nodes pick them up via wildcards. Variables are for the user to configure at stream level, not for nodes to drive.

## On-demand resolution inside `execute()`

If you have a string that *might* contain wildcards and you want to resolve it dynamically (e.g., constructing a URL from a template input):

```typescript
const template = this.wave.inputs.getInputValueByInputName(Input.URL_TEMPLATE) as string;
// Input is already resolved at this point — but you might want to resolve a different string:
const someDynamicString = `${template}/${entityId}`;
const resolved = this.wave.general.resolveValue(someDynamicString);
```

`resolveValue` returns `number | string` per `node_modules/wave-engine/helpers/Wave.d.ts` — the resolver returns the value it produced without any re-typing beyond what `JSON.stringify` does for object results. Cast deliberately.

## Patterns

**Reading an upstream output via UUID:**

In the Stream Designer the user wires connections — you don't write wildcards by hand. But when *testing*, you do:

```typescript
// tests/framework/example.ts (paraphrased)
const design = {
    nodes: [
        { uuid: "u-get-secret", className: "GetSecret", inputs: [{ name: "Key", value: "github.token" }] },
        { uuid: "u-create-issue", className: "CreateIssue", inputs: [
            { name: "Bearer token", value: "{{node.u-get-secret.output.value}}" },
        ]},
    ],
};
```

**Reading the payload in a node that's the first in a stream:**

If your node is the *entry point* of a stream, the user's payload is available as `{{PAYLOAD}}` — but typically you don't write the wildcard, you declare an input `Payload` of type `ANY` and the user/test wires the payload into it.

**Reading org/space context:**

You usually want this for hcloud-sdk calls, not for wildcards:

```typescript
const org = this.wave.general.getOrgName();
const space = this.wave.general.getSpaceName();
const client = this.wave.general.getHcloudClient();
const secret = await client.High5.space.secret.getSecret(org, space, "github.token");
// ^ but wait — a node should NOT do this. See secrets-and-auth.md.
```

## Anti-patterns

- **Trying to set a stream variable from inside a node.** Not supported. Use outputs and downstream wildcard bindings.
- **Hand-writing wildcards into input *defaultValue*s.** The defaults are resolved like any other input; if the wildcard references nodes that aren't present, the resolver throws. Use literal defaults.
- **Writing `{{OUTPUT.<uuid>.input.X}}` to read an upstream input.** There's no `input` sub-path under `OUTPUT`. Use `{{node.<uuid>.input.X}}`.
- **Assuming a `{{` in arbitrary data is safe.** There's no escaping in 2.0.1 — a literal `{{` that happens to look like a wildcard path can trigger a resolution attempt (and throw if it doesn't resolve).
- **Logging the *unresolved* input string when debugging.** `getInputValueByInputName` already gives you the resolved value; logging it after resolution is what you want for "what does the node actually receive".
- **Assuming wildcards work inside arbitrary strings in `execute()`.** They don't — resolution happens at input load time, not on string interpolation. If you need on-demand resolution, call `resolveValue` explicitly.

## Curiosity hooks

- The 100-nesting cap exists to prevent recursive-template denial-of-service. If you're nesting more than a few wildcards, the design is probably wrong — split the work across nodes.
- `getInputOriginalValueByInputName` is rarely needed in production code, but it's useful in debugging — it shows you what the user typed before the engine touched it, which helps when a wildcard isn't resolving as expected.
- `node_modules/wave-engine/utils/WildcardResolver.js` is short (190 lines) and worth a direct read if you want to know exactly what's possible — it's a single class with one `switch` per scope.
