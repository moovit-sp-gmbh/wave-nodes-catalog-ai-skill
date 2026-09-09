# Using the hcloud-sdk from a node

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts below against the installed `.d.ts` files — never from memory.

## When to use

Whenever your node needs to read from or write to anything inside the helmut.cloud platform. Do **not** hand-roll HTTP requests against `api.helmut.cloud`; always go through the sdk.

## Concept: the product map

`node_modules/hcloud-sdk/lib/Hcloud.d.ts` declares exactly these top-level client getters, each returning a service class:

| Getter | What it's for (from its sub-resources) |
|---|---|
| `client.Agent` | agent installer/bundle distribution and per-agent contexts (`context`, `bundle`, `devBundle`, `installer`) |
| `client.Auditor` | internal-only surface (`internal`) — not explored |
| `client.Bouncer` | feature-flag lookup (`features.getHcloudFeatures()`) |
| `client.High5` | the automation/runtime product — streams, executions, webhooks, secrets, pools, nodes (see table below) |
| `client.Idp` | identity, auth, and tenancy — users, organizations, OAuth (see table below) |
| `client.Fuse` | space-scoped cronjobs (`space.cronjob`) plus internal surfaces (`internal`, `spaceInternal`) |
| `client.Dali` | read-model/avatar views of other entities (`avatar` → user, organization, team, high5 space, high5 pool, fuse space, oauth app) — not explored further |
| `client.Mailer` | internal-only surface (`internal`) — not explored |
| `client.Mothership` | agent check-in/heartbeat protocol (`hello`, and more per `lib/service/mothership/index.d.ts`) |
| `client.Nats` | NATS connection/auth helper (JWT or username+password), not a REST resource tree |

There is no `client.Cosmo` and no `client.Shorts` — don't invent either.

When you don't know which entity is the right one for a task: read `node_modules/hcloud-sdk/lib/service/<product>/` to enumerate, then `lib/interfaces/<product>/` for the type shape. Never invent a method name from memory.

## High5 and Idp: the getter chains a node actually touches

All names below are copied verbatim from the installed `.d.ts` files (paths noted per row). Signatures are abbreviated to name + params + return type; open the file for full param docs.

### `client.High5` (from `lib/service/high5/index.d.ts`)

| Getter | Returns |
|---|---|
| `client.High5.space` | `High5Space` — space-scoped sub-tree, see below |
| `client.High5.wave` | `High5Wave` — has `.s3` (bundle storage), no other methods declared |
| `client.High5.joinToken` | `High5JoinToken` — `get(orgName, limit?, page?)`, `create(orgName, name)`, `revoke(orgName, tokenId)`, `exchange(joinToken)` |
| `client.High5.execution` | `High5OrganizationExecute` — `cancelExecution(orgName, spaceName, high5ExecutionId): Promise<void>`, plus `.logs` / `.status` sub-getters |
| `client.High5.internal` | internal-only surface — not explored |

### `client.High5.space.*` (from `lib/service/high5/space/index.d.ts`)

| Getter | Key methods (name(params): return) |
|---|---|
| `client.High5.space.event` | `searchEvents({orgName, spaceName, filters?, sorting?, limit?, page?}): Promise<PaginatedResponse<Event>>`, `getEvent(orgName, spaceName, eventName): Promise<Event>`, `createEvent(orgName, spaceName, name): Promise<Event>`, `renameEvent(...)`, `deleteEvent(...)`; has `.stream` sub-getter |
| `client.High5.space.execute` | `executeHigh5Stream(orgName, spaceName, streamId, high5ExecutionRequest, design?, debug?): Promise<High5ExecutionResponse>`, `executeHigh5Event(orgName, spaceName, eventName, high5EventExecutionRequest): Promise<High5ExecutionResponse[]>`, `getStreamExecutionPackage(...)`, `issueDebugCommand(...)`, `logExecutionCrash(...)` |
| `client.High5.space.webhook` | `searchWebhooks(...)`, `getWebhook(orgName, spaceName, webhookId): Promise<Webhook>`, `createWebhook(orgName, spaceName, WebhookCreate): Promise<Webhook>`, `updateWebhook(...)`, `deleteWebhook(...)`, `triggerWebhook(webhookUrl): Promise<void>`, `executeWebhookByUrl(...)`, `respondToWebhook(...)`, `validateWebhookUrl(...)`; has `.log` sub-getter |
| `client.High5.space.secret` | see worked pattern below |
| `client.High5.space.pool` | `getPool(orgName, spaceName, name): Promise<Pool>`, `replacePool(...)`, `patchPool(...)`, `deletePool(...)`, `searchPools(...)`, `addPool(orgName, spaceName, name, targets): Promise<PoolChange>`, `getPools(): Promise<Pool[]>`, `searchTargetsOfPool(...)` |
| `client.High5.space.wave` | `patchSpaceWaveEngine(...)`, `getSpaceWaveEngine(orgName, spaceName): Promise<WaveEngine>`, `addUpdateSpaceWaveCatalog(...)`, `getSpaceWaveCatalogs(orgName, spaceName): Promise<WaveCatalog[]>`, `deleteSpaceWaveCatalog(orgName, spaceName, catalogId): Promise<void>` |
| `client.High5.space.node` | `getAllNodes(orgName, spaceName, limit?, page?): Promise<Node[]>`, `getNode(orgName, spaceName, nodeId): Promise<Node>`, `createNode(...)`, `deleteNode(...)`, `patchNode(...)`, `getNodeContent(orgName, spaceName, secret): Promise<string>` |

`client.High5.space` itself also declares `searchSpaces`, `searchSpacePermissions`, `getSpace`, `createSpace`, `deleteSpace`, `updateUserSpacePermission`, `updateTeamSpacePermission`, `searchStreamsOfSpace`, `renameSpace`.

There is no `client.High5.space.stat`, `.database`, or `.job` in this sdk version — those were a stale claim in an earlier draft of this file.

### `client.Idp` (from `lib/service/idp/index.d.ts`), two levels deep

| Getter | Key methods / sub-getters |
|---|---|
| `client.Idp.organization` | methods `updateOrganization(orgName, newName, company?)`, `createOrganization(name, company?)`, `getOrganization(orgName, options?): Promise<Organization>`, `deleteOrganization(orgName)`; sub-getters `.member`, `.settings`, `.teams` (note: plural — not `.team`), `.license` |
| `client.Idp.user` | methods `getUser(): Promise<User>`, `patchUser(user)`, `patchUserPassword(oldPassword, newPassword, totp?)`, `deleteUserSession()`, `deleteUser()`, `searchOrganizations(...)`, `searchInvitations(...)`, `ping()`; sub-getters `.settings`, `.password`, `.license` |
| `client.Idp.oAuth` | note the exact casing — capital A, not `oauth`. Methods only, no sub-getters: `getAuthorizationCodeInsideRedirectUrl(...)`, `getInfoOrAuthorizationCodeInsideRedirectUrl(...)`, `createScopesAndGetAuthorizationCodeInsideRedirectUrl(...)`, `exchangeCodeForToken(tokenRequest): Promise<OAuthToken>`, `getOAuthAppInfo(clientId): Promise<OAuthAppPublicInfo>` |

`client.Idp` also exposes `.registration` and `.internal` (not walked here), plus top-level `login`, `loginWithOIDC`, `loginWithSAML`, `preLogin`, `resetPassword`, `version`.

There is no `serviceAccounts` or `stat` getter under `client.Idp.organization` in this sdk version, and the teams getter is `.teams`, not `.team` — both were stale claims in an earlier draft of this file.

### How to discover the rest

For any product/resource not covered above: open `node_modules/hcloud-sdk/lib/service/<product>/index.d.ts` and follow the `get <name>()` declarations down the tree; cross-reference `lib/interfaces/<product>/` for the payload/return shapes. Do this before calling anything not listed in this file.

## Worked pattern: Get-secret node

```typescript
async execute(): Promise<void> {
    try {
        const client = this.wave.general.getHcloudClient();
        const org = this.wave.general.getOrgName();
        const space = this.wave.general.getSpaceName();
        const key = this.wave.inputs.getInputValueByInputName(Input.KEY);

        const secret = await client.High5.space.secret.getSecret(org, space, key);

        this.wave.outputs.setOutput(Output.VALUE, secret.value);
    } catch (err: unknown) {
        const message = (err as Error)?.message ?? "unknown error";
        throw new Error(`Could not get secret — sdk request failed: ${message} — verify org/space/key and try again`);
    }
}
```

`getSecret(orgName: string, spaceName: string, key: string): Promise<Secret>` — from `lib/service/high5/space/secret/index.d.ts`. The `Secret` interface (`lib/interfaces/high5/space/secret/index.d.ts`) has fields: `key: string`, `value?: string`, `encrypted: boolean`, `description?: string`, `creator: ReducedUser`, `createDate: number`, `modifyDate: number`.

**hcloud-sdk nodes have no `Curl` output.** `wave.axiosHelper.convertRequestToCurl` converts an `AxiosRequestConfig`; a node calling through `getHcloudClient()` never builds one — the sdk constructs and sends the request internally. Don't hand-build a curl string as a substitute. Document which sdk method and resource the node calls in the wavedoc instead. See `naming-and-style.md` ("Always include a `Curl` output on axios-based HTTP nodes").

**A node never calls the secret store from `execute()`** — this exact call belongs only in a dedicated *Get Secret* node. Any other node receives credentials via a `STRING_PASSWORD` input; the user decides how to supply the value. See `secrets-and-auth.md`.

**Caveat**: sub-resource names above were verified against hcloud-sdk 16.0.0 on 2026-09-02. Before calling `client.<Product>.<resource>.<method>(...)` in generated code, re-open the corresponding `.d.ts` and confirm the getter name and method signature still match — don't trust this file blindly if the installed version differs.

## Why the sdk

- **Authentication is pre-wired.** `this.wave.general.getHcloudClient()` returns a client already configured with the org's auth token from the execution request. You don't pass credentials.
- **Types are first-class.** The sdk ships TypeScript interfaces for every resource, so `npx tsc --noEmit -p tsconfig.lib.json` catches mistakes before they reach runtime.
- **Upgrade-safe.** When helmut.cloud evolves its API, the sdk releases a new major. Hand-rolled requests just break silently.
- **Consistent error shape.** The sdk normalizes errors; you don't have to interpret different HTTP error formats.

## Patterns

**Context resolution** — almost every sdk method that touches a high5 resource needs `orgName` and `spaceName`. Pull them from `this.wave.general.getOrgName()` and `getSpaceName()`. Don't take them as inputs unless the node specifically needs to operate on a *different* org/space than the current execution context.

**Error handling** — sdk methods reject with an `Error` (or a more specific subclass). Use `isHCloudError` from `hcloud-sdk` to check whether an error originated in the sdk:

```typescript
import { isHCloudError } from "hcloud-sdk";

try {
    await client.High5.space.event.searchEvents({ orgName: org, spaceName: space });
} catch (err) {
    if (isHCloudError(err)) {
        // HCloudError is flat — status/statusText/code/error/message, no nested
        // `.response`. Confirmed in lib/interfaces/global/HCloudError.d.ts.
        const status = err.status;
        if (status === 404) throw new Error(`Could not find space — space '${space}' does not exist — verify the space name`);
        if (status === 403) throw new Error(`Could not access space — insufficient permissions — verify the execution token's scope`);
    }
    throw new Error(`Could not query helmut.cloud — sdk request failed — check logs for details`);
}
```

`isHCloudError` and the `HCloudError` shape come from `lib/helper/ErrorHelper.d.ts` and `lib/interfaces/global/HCloudError.d.ts`: `status: number`, `statusText: string`, `code: string`, `error: string`, `message: string`.

## Anti-patterns

- **Hand-rolling HTTP requests against `api.helmut.cloud`** to bypass the sdk. Fragile, type-unsafe, breaks on upgrade.
- **Hard-coding the sdk client constructor with explicit credentials.** The injected client already has them. Don't `new HCloud({ token })` inside `execute()` — use `getHcloudClient()`.
- **Taking org/space as `STRING` inputs when the execution context already has them.** Wastes the user's time and creates the opportunity for mismatch.
- **Reading the secret store from inside `execute()`** via the sdk, in any node other than the dedicated *Get Secret* node. See `secrets-and-auth.md`.
- **Importing the sdk via `require("hcloud-sdk")`** in a TypeScript catalog. Use `import`.
- **Trusting a sub-resource name from memory or from this file without re-checking the `.d.ts`** — several names above look plausible but are wrong (`oauth` vs `oAuth`, `team` vs `teams`, `execution` vs `execute` for the space-scoped execute getter).

## Curiosity hooks

- The sdk client returned by `getHcloudClient()` is constructed once per execution by the wave-engine from the execution request payload. Don't try to cache it across nodes.
- For a tour of what's possible, browse `node_modules/hcloud-sdk/lib/service/high5/` after `npm install` — every directory under there is a piece of the high5 product you can manipulate.
- If you find yourself wanting an sdk method that doesn't exist, that's an sdk feature request, not a workaround.
