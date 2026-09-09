# Secrets, credentials, and authentication

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Any time your node needs an API key, bearer token, password, OAuth token, basic-auth pair, or any other credential to do its job.

## The node author's rule: accept credentials as inputs

**The single most important rule in this file:** a node **does not** read the helmut.cloud secret store from inside `execute()`. Your node declares a `STRING_PASSWORD` input; the user supplies the value at design time however they choose. Your contract is just *"this input is a credential string"*.

How the user supplies the value is **not your concern**. They might:

- Type the credential as a literal into the input field (fine for non-sensitive values; insecure for real secrets, but the user's call).
- Wire an upstream **Get Secret** node that pulls from the helmut.cloud secret store and pipes its output into your credential input. *This is the recommended production pattern* for sensitive credentials but not the only one.
- Wire the output of any other node that produces a string (a *Decrypt* node, an *HTTP Get* against a vault, a *Read File*).
- Reference a stream variable or payload field via the standard wildcard binding.

A typical recommended composition with *Get Secret* looks like:

```
[ Get secret ]  →  [ Your node ]
   output: value      input: Api key
```

Either way, the wave-engine resolves the binding at input time and your `execute()` receives a plain string. The node has no idea where it came from — and shouldn't care.

**Why "no secret-store calls from inside execute":**

- Single responsibility. The user chooses the supply mechanism; your node sticks to its domain.
- Auditability. With *Get Secret* in the graph, the stream visually shows which secrets feed which nodes; with another supply mechanism, the user still sees the wiring.
- Testability. In tests you replace the input with a literal string; your node doesn't need to be wired to a vault.
- Catalog portability. Your node works the same in any context — no SDK call dependent on org/space, no hard dependency on the helmut.cloud secret store specifically.

## Declaring a credential input

Use `STRING_PASSWORD` so the value is masked in the Stream Designer UI. **The engine does not auto-redact `STRING_PASSWORD` from logs** — never `addNodeLog` the value.

```typescript
enum Input {
    JITBIT_URL = "Jitbit url",
    API_KEY = "Api key",
}

specification: StreamNodeSpecificationV3 = {
    specVersion: 3,
    deprecated: false,
    // ...
    inputs: [
        {
            name: Input.JITBIT_URL,
            description: "Enter the base url of the Jitbit instance",
            type: StreamNodeSpecificationInputType.STRING,
            example: "https://helmut.cloud/jitbit",
            mandatory: true,
        },
        {
            name: Input.API_KEY,
            description: "Enter the api key for the Jitbit API",
            type: StreamNodeSpecificationInputType.STRING_PASSWORD,
            example: "abc123def456",
            mandatory: true,
        },
    ],
    // ...
};
```

In `execute()`:

```typescript
const apiKey = this.wave.inputs.getInputValueByInputName(Input.API_KEY) as string;
// Use apiKey to authenticate the request. Never log it.
```

## Per-protocol auth patterns

**Bearer token:**

```typescript
const token = this.wave.inputs.getInputValueByInputName(Input.BEARER_TOKEN) as string;
const headers = { Authorization: `Bearer ${token}` };
```

**API key in header:**

```typescript
const apiKey = this.wave.inputs.getInputValueByInputName(Input.API_KEY) as string;
const headers = { "X-API-Key": apiKey };  // or whatever header the provider expects
```

**Basic auth:**

```typescript
const username = this.wave.inputs.getInputValueByInputName(Input.USERNAME) as string;
const password = this.wave.inputs.getInputValueByInputName(Input.PASSWORD) as string;
const headers = { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` };
```

**OAuth (access + refresh tokens):**

Expose **two** inputs (`Access Token`, `Refresh Token`), both `STRING_PASSWORD`. If the node detects an expired access token, it can either:
- Throw with a clear message telling the user to refresh via their own flow, OR
- (Less common) call the provider's `/oauth/token` refresh endpoint using the refresh token, get a new access token, and use it for the in-flight request.

Don't try to *write back* a refreshed token — nodes can't mutate stream variables (see `wildcards-and-variables.md`). If refresh is part of your design, surface the new access token as an output and let the user wire it forward.

**Multi-field credentials (AWS-style):**

When a service needs multiple fields (access key + secret + region for AWS), expose them as separate inputs. Group them by listing them sequentially in the spec. Mark all mandatory.

```typescript
inputs: [
    { name: Input.AWS_ACCESS_KEY_ID, description: "Enter your AWS Access Key ID", type: STRING_PASSWORD, mandatory: true, example: "AKIA..." },
    { name: Input.AWS_SECRET_ACCESS_KEY, description: "Enter your AWS Secret Access Key", type: STRING_PASSWORD, mandatory: true, example: "..." },
    { name: Input.AWS_REGION, description: "Enter the AWS region", type: STRING, mandatory: true, example: "us-east-1" },
]
```

The user wires whatever supply mechanism they want into each of the three inputs (commonly three *Get Secret* nodes, but the choice is theirs).

## URL-input pattern for SaaS endpoints `[House style]`

Pair the credential input with a URL input named `<Product> url` (sentence case per the casing rule) so the user can self-host or use a different region:

```typescript
{
    name: "Jitbit url",
    description: "Enter the base url of the Jitbit instance",
    type: StreamNodeSpecificationInputType.STRING,
    example: "https://helmut.cloud/jitbit",
    mandatory: true,
}
```

## Anti-patterns

- **Reading the secret store directly from `execute()`** via `wave.general.getHcloudClient().High5.space.secret.getSecret(...)`. Don't. The credential should arrive via the input; the user's supply mechanism (Get Secret, literal, other) is none of the node's business. Calling the secret store from inside `execute()` hard-codes your node to helmut.cloud's specific vault and breaks portability.
- **Hardcoded credentials anywhere in the source.** Obvious, but worth saying. No defaults that contain real keys, no test fixtures with real tokens.
- **`STRING` instead of `STRING_PASSWORD` for sensitive inputs.** Renders in plaintext in the UI. Use the password type.
- **Logging the credential value** via `addNodeLog`, `console.log`, `this.wave.logger.updateMessage(`token=${token}`)`. The engine does not redact.
- **Echoing the credential into an output.** `setOutput(Output.AUTH_USED, token)` — somebody downstream will accidentally render it.
- **Embedding the credential in the curl output** (which uses STRING type, not redacted). Use a placeholder when building curl: `"Authorization: Bearer <your-token>"`.

```typescript
const curl = this.wave.axiosHelper.convertRequestToCurl({
    ...config,
    headers: { ...config.headers, Authorization: "Bearer <your-token>" },  // Placeholder, not real token
});
this.wave.outputs.setOutput(Output.CURL, curl);
```

- **Caching a token across executions** in a module-level variable. Nodes are instantiated per execution; module-level state may or may not persist depending on the engine's caching, and either way it's a debugging nightmare. If you need fresh tokens, the user wires fresh secrets.
- **Interpolating a `STRING_PASSWORD` into a shell command.** If the node spawns a child process and the credential ends up in argv (or worse, inside a `-c` string), the threat surface widens beyond logging — see `references/shell-injection-and-process-execution.md`. Pass credentials via environment variables to the child or via stdin, not as command-line arguments, and always redact them in the `Command` output.

## Curiosity hooks

- The helmut.cloud secret store *does* have a CRUD API on `hcloud-sdk` (`High5.space.secret.getSecret/searchSecrets/addSecret/updateSecret/deleteSecret`), but it's there for the *Get Secret* node implementation and admin tooling — not for arbitrary catalog nodes to call. Don't reach for it from a custom catalog node.
- A node that needs many credential inputs often signals a missed action-composition opportunity. Five upstream credential providers feeding one big node usually means you've split what should be three nodes back into a "kitchen sink" or — opposite — composed too much. Re-read `action-not-endpoint.md` if you're staring at six credential inputs on one node.
- Per-protocol patterns above are the common ones. For weird custom schemes (HMAC-signed requests, mTLS certificates, SOAP WS-Security), document the auth shape in the wavedoc carefully — those are where users get stuck most.
