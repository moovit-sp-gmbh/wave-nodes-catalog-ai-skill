# Naming and style `[House style — override if user prefers]`

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

All rules in this file are MoovIT house style. They're how MoovIT names and writes its own catalogs. They're soft — the engine doesn't enforce them. If the user opted out of house style at the start of the session, these are suggestions, not requirements.

## When to use

Before scaffolding any node — settle naming first, because it ripples into the class name, file name, `index.ts` import, sidecar `.md`, and downstream test names. Renaming after the fact is costly.

## Casing — sentence case for all user-visible strings `[House style, MUST]`

All user-visible string values use **sentence case**: first letter of the first word uppercase, all subsequent words lowercase. **MUST NOT** be Title Case or All-Caps acronyms.

**Applies to:**

- Input `name`
- Output `name`
- `specification.name` (the node name)
- `category`
- `STRING_SELECT` option keys
- Additional-connector names

**Does NOT apply to:**

- `description` fields (which are label sentences — but see the "No trailing period" rule below)
- Example values that reproduce real-world strings (e.g., a real URL, a real ID format)
- Class names — those stay `PascalCase` (TypeScript convention)
- Enum identifiers — those stay `SCREAMING_SNAKE_CASE` (TypeScript convention). Only the enum **string value** changes.

**Good / bad:**

| Bad (Title Case / acronyms) | Good (sentence case) |
|---|---|
| `Task ID` | `Task id` |
| `Task URL` | `Task url` |
| `API base URL` | `Api base url` |
| `JSON output` | `Json output` |
| `HTTP method` | `Http method` |
| `OAuth token` | `Oauth token` |
| `Bearer Token` | `Bearer token` |
| `Customer Accounts` (category) | `Customer accounts` |

**Why not preserve acronyms?** Stream Designer renders these as compact labels in a dense panel. Sentence case scans faster, matches the rest of the helmut.cloud UI, and removes the recurring "is ID an acronym here or not" judgment call.

**Enum example showing identifier vs value:**

```ts
enum Output {
    TASK_ID = "Task id",      // identifier SCREAMING_SNAKE; value sentence case
    TASK_URL = "Task url",
    CURL = "Curl",
    TASK = "Task",
}
```

**Lint enforcement.** The `node-specification` ESLint rule should flag Title Case or All-Caps acronyms in any user-visible string value (input name, output name, category, etc.). Prose rules lose to model priors — lint is the most reliable countermeasure.

### `STRING_SELECT` — keys are user-visible, values are wire-format `[Important]`

A `STRING_SELECT` input declares an `options` map where each entry has two halves with **different casing rules**:

| Half | What it is | Casing rule |
|---|---|---|
| **Key** (object key, left of `:`) | The UI label shown in the dropdown | **Sentence case** (per the casing rule above) |
| **Value** (string value, right of `:`) | The literal string passed to `execute()` and sent to the API | **Match the API's expected literal** — often lowercase, kebab-case, or whatever the API documents |

The two are independent. Sentence-casing the value would break the API call; preserving the API's casing in the key would clutter the UI with technical literals.

**Good:**
```ts
options: {
    "Open": "open",                  // API expects lowercase
    "In progress": "in-progress",    // API expects kebab-case
    "Done": "done",
}
```

**Good (when the API uses casing that happens to match the UI key):**
```ts
options: {
    "Get": "GET",       // HTTP method literal — API expects uppercase
    "Post": "POST",
    "Delete": "DELETE",
}
```

**Bad** (key in Title Case — violates the casing rule):
```ts
options: {
    "In Progress": "in-progress",   // key should be "In progress"
}
```

**Bad** (value sentence-cased to match the key — breaks the API call):
```ts
options: {
    "In progress": "In progress",   // API expects "in-progress", not "In progress"
}
```

In `execute()`, the value you receive from `this.wave.inputs.getInputValueByInputName(...)` is the **value** half, not the key — pass it directly to the API.

## Input entity qualification `[House style, MUST for entity-property inputs]`

Input names that describe a **property of the entity the node operates on** lead with the entity name. A `CreateClickUpTask` node has `Task name`, `Task description`, `Task tags` — not bare `Name`, `Description`, `Tags`.

**Why.** Wildcards make field names appear next to other nodes' fields in the Stream Designer wildcard picker. Bare `Name` is unselectable when six upstream nodes each emit something called `Name`. `Task name` is unambiguous.

**The entity is the noun in the node's class name:** `Create<Entity><Action>` → entity = `<Entity>`. For `CreateClickUpTask`, the entity is `Task`. For `SendSlackMessage`, the entity is `Message`.

**Good / bad — entity-property inputs:**

| Bad (bare) | Good (entity-qualified) |
|---|---|
| `Name` | `Task name` |
| `Description` | `Task description` |
| `Tags` | `Task tags` |
| `Priority` | `Task priority` |
| `Assignee` | `Task assignee` |

**Exceptions — call-level inputs stay un-prefixed:**

Inputs that describe the **call** rather than the entity stay un-prefixed because they belong to no entity:

| Un-prefixed (correct) | Why |
|---|---|
| `Authorization token` | property of the call |
| `Api base url` | property of the call |
| `Timeout` | property of the call |
| `Fail on non-2xx` | property of the call |
| `Bearer token` | property of the call |
| `Api key` | property of the call |

## Node names

**Shape:** `<Verb> <Entity>` for CRUD wrappers; `<Verb> <Object>` for non-CRUD. **Sentence case** (per the casing rule above) — *"Create ticket"*, not *"Create Ticket"*. Prefer two words — three is fine when clarity demands it (*"Parse csv row"*). Never use abbreviations the user wouldn't recognize at a glance.

**CRUD verb vocabulary** — pick one consistent verb per operation type so the catalog reads predictably:

| HTTP | Verb |
|---|---|
| GET (one) | `Get` |
| GET (many) | `List` |
| POST | `Create` |
| PUT | `Replace` |
| PATCH | `Update` |
| DELETE | `Delete` |

So: *Get ticket*, *List tickets*, *Create ticket*, *Update ticket*, *Delete ticket*. The singular/plural in the entity name disambiguates one-vs-many: *Get ticket* is the singular retrieval; *List tickets* is the collection. Don't use `Get` for the collection.

**Non-CRUD verb vocabulary** — same idea, pick one per concept:

`Send`, `Download`, `Upload`, `Parse`, `Convert`, `Generate`, `Hash`, `Compress`, `Decompress`, `Validate`, `Notify`, `Trigger`, `Wait`, `Run`, `Start`, `Stop`, `Restart`, `Remove`, `Copy`, `Move`, `Rename`, `Check`.

`Copy`, `Move` and `Rename` cover storage-style operations that have no CRUD equivalent (*Copy object*, *Move object*, *Rename object*). `Check` is for existence or state probes that resolve on both outcomes instead of failing (*Check object exists*); the result is a BOOLEAN output, never a pair of connectors.

**File names match class names** — `lib/nodes/CreateTicket.ts` exports `default class CreateTicket extends Node`. PascalCase the class name; the spec's `name` field uses the human form in sentence case (*"Create ticket"*, not *"Create Ticket"*). The Stream Designer renders the human form.

**Avoid:**

- `Get` as the verb for **collections** — use `List` for many, `Get` only for the singular retrieval. The entity name (singular vs. plural) carries the disambiguation.
- Product names in the node name — they belong in the *category* and the *description*, not the node name. Instead of `Jitbit Create Ticket`, use `Create Ticket` in the *Tickets* category with the description ending in *"in Jitbit"*.
- Suffixes like `Node`, `Action`, `Step` — the type system already says these extend `Node`. (Exception: legacy catalogs that already use `*Action.ts` conventions — match what's there.)

## Categories

Pluralized entity noun, max two words, **sentence case** (per the casing rule above), consistent with any sibling nodes already in the cluster. *Tickets*, *Users*, *Webhooks*, *Customer accounts*, *Kubernetes pods*. One category per related cluster of nodes — five CRUD operations on *Tickets* all share the *Tickets* category. Don't reuse a bare product/platform name as the category ("Jitbit", "Kubernetes") — that fragments related actions across vendors and the UI shows hundreds of one-node categories; pair it with the pluralized entity instead (*Kubernetes pods*, not *Kubernetes*).

**Exception — non-entity transforms.** A node with no operating entity at all (a pure transform: hashing, encoding, string manipulation) may use a singular domain noun instead of forcing a pluralized entity that doesn't exist — *Cryptography*, *Text*.

## Node descriptions

**≤ 85 characters, one short sentence**, present tense, ends with a product name when relevant.

**Same anti-marketing / anti-jargon rule as catalog descriptions.** No marketing adjectives (*powerful*, *comprehensive*, *seamless*), no vague benefit verbs (*automate*, *streamline*, *empower*), no infrastructure jargon (*API*, *endpoint*, *webhook*, *OAuth*, *SDK*), no meta-platform references (*"in helmut.cloud streams"*). The templates below already constrain language to plain action verbs + entity nouns, which is the right register — don't drift toward marketing copy when filling the placeholders. Full rationale and forbidden-word list in `references/catalog-and-distribution.md` ("Catalog description rules").

Templates:

| Operation | Template | Example |
|---|---|---|
| Create | `Creates a new <entity> in <Product>` | `Creates a new ticket in Jitbit` |
| Update | `Updates an existing <entity> in <Product>` | `Updates an existing user in Jitbit` |
| Get | `Gets details of a specific <entity> from <Product>` | `Gets details of a specific project from Freispace` |
| List | `Lists <entities> in <Product>` | `Lists tickets in Jitbit` |
| Delete | `Deletes a <entity> from <Product>` | `Deletes a user from Jitbit` |
| Non-CRUD | One short sentence about the action | `Computes the SHA-256 hash of a string` |

## Inputs

### Machine-friendly value translation `[House style, MUST]`

**Input types are for humans, not for the API.** When the API expects a value in a form no human can produce by hand at design time — epoch timestamps, base64-encoded payloads, URL-encoded JSON, bit-field flags packed into an integer, internal UUIDs the user doesn't memorize — expose the input in human-typeable form and translate at the `execute()` boundary. The API's wire format is an implementation detail the node hides.

**Common patterns:**

| API expects | Input shows (type + format hint) | Conversion inside `execute()` |
|---|---|---|
| Epoch milliseconds | `STRING` with `(YYYY-MM-DDTHH:mm:ssZ)` hint | `new Date(input).getTime()` |
| Epoch seconds | `STRING` with `(YYYY-MM-DDTHH:mm:ssZ)` hint | `Math.floor(new Date(input).getTime() / 1000)` |
| Base64-encoded file content | `STRING` file path | `(await fs.readFile(path)).toString("base64")` |
| URL-encoded JSON | `STRING_LONG` (JSON object), parsed at the boundary | `encodeURIComponent(JSON.stringify(input))` |
| Bit-field flags packed into an integer | `STRING_LIST` of named flags | bitwise-OR the named values |
| Internal record UUID | `STRING` human-readable identifier (name, slug, key) | look up via a list/search endpoint, cache the lookup |
| Duration as nanoseconds / microseconds | `NUMBER` in seconds or ms with unit in the description | multiply at the boundary |
| Compressed/encoded payload | the plain payload (`STRING_LONG`) | gzip/encode at the boundary |
| Cron expression | `STRING` with `(cron expression, e.g. "0 9 * * 1")` hint | pass through; validate via a regex or lib |
| HMAC-signed token | the plain payload (`STRING` / `STRING_LONG`) + the secret as a separate `STRING_PASSWORD` | sign at the boundary |

**Bad** (what a 1:1 OpenAPI mapping produces):

```ts
{
    name: Input.TASK_DUE_DATE,
    description: "Enter the task due date as epoch milliseconds",
    type: StreamNodeSpecificationInputType.NUMBER,
    example: 1735689600000,  // no human can produce this on the fly
}
```

**Good:**

```ts
{
    name: Input.TASK_DUE_DATE,
    description: "Enter the task due date (YYYY-MM-DDTHH:mm:ssZ)",
    type: StreamNodeSpecificationInputType.STRING,
    example: "2025-01-01T00:00:00Z",
}
// inside execute():
const dueEpochMs = new Date(dueDateInput).getTime();
if (Number.isNaN(dueEpochMs)) {
    throw new Error(
        "Could not parse Task due date — value is not a valid ISO 8601 timestamp — use the format YYYY-MM-DDTHH:mm:ssZ"
    );
}
```

**Validation at the boundary.** Whenever you translate, validate immediately and fail with a three-part error (see `errors.md`). Wire-format errors caught at the boundary surface as readable Stream Designer errors instead of cryptic API rejections downstream.

**Heuristic:** if you can't picture the user typing the value directly into the Stream Designer panel without opening a converter tab, the input type is wrong. The wire format goes inside `execute()`; the human form goes in the spec.

**Don't over-apply.** Some "machine-y looking" values are still the right input type because the user *does* have them: a UUID copied from another node's output (use STRING), an OAuth access token (use STRING_PASSWORD), an upload's content-type (use STRING_SELECT). The rule is about *transformation*: if the user has to compute the input from a value they actually know, the node should do the computing.

### Names

**Names:** **Sentence case** (per the casing rule above), as concise as is still self-explanatory. Reflect the field, not the parameter name from the API. For entity-property inputs, **lead with the entity name** (per the Input entity qualification rule above) — `Task name`, not `Name`.

| Domain | Good | Bad |
|---|---|---|
| URL of a SaaS endpoint | `Jitbit url`, `Mongodb url` | `URL`, `Endpoint`, `Jitbit URL` |
| Bearer token | `Bearer token` | `Token`, `Auth`, `Bearer Token` |
| API key | `Api key` | `Key`, `Secret`, `API Key` |
| First name of a person | `First name`, `User first name` | `Given`, `Fname`, `First Name` |
| Date input requiring a format | `Booking start date (YYYY-MM-DD)` | `Start`, `Date`, `Booking Start Date` |

**Descriptions:** aim for **60–80 characters**, hard cap **120**. Concise scannable text measurably improves form usability — every extra word is friction across a panel of 8 inputs. Most descriptions are imperative second-person; BOOLEAN and STRING_READONLY are the principled exceptions (see table). **The opening verb is dictated by the input type** — don't pick one freely. Pick from the table below based on the `StreamNodeSpecificationInputType` you're declaring, then fill in the noun phrase.

**Per-type opening-verb rules:**

| Input type | Opener | Register | Example |
|---|---|---|---|
| `STRING` | `Enter the …` | Imperative | `Enter the ID of the ticket to get` |
| `STRING_LONG` | `Enter the …` | Imperative | `Enter the HTTP request body content` |
| `STRING_LONG` (holding JSON) | `Enter the …` | Imperative | `Enter the request payload (JSON object)` — always end with `(JSON object)` / `(JSON array)`, parsed and validated at the `execute()` boundary |
| `STRING_LIST` | `Enter one or more …` | Imperative | `Enter one or more full file paths to copy` |
| `STRING_MAP` | `Enter the …` | Imperative | `Enter the HTTP headers` |
| `STRING_PASSWORD` | `Enter the …` | Imperative | `Enter the api key for the Jitbit API` |
| `STRING_SELECT` | `Choose the …` | Imperative | `Choose the HTTP method` |
| `STRING_READONLY` | `Displays the …` | Declarative (no user action) | `Displays the auto-generated request ID` |
| `NUMBER` | `Enter the …` | Imperative | `Enter the timeout for the request (in milliseconds)` |
| `BOOLEAN` | `<Verbs> the …` *(third-person present)* | Declarative (describes the checked state's outcome) | `Verifies the TLS certificate before sending the request` |
| `ANY` | `Provide the …` | Imperative | `Provide the value to forward downstream (any type)` |

**BOOLEAN — bad vs. good:**

| Bad | Good |
|---|---|
| `Choose whether response codes outside 2xx fail the node` | `Fails the node when the response status is outside the 2xx range` |

**No `JSON` input type — use `STRING_LONG` and parse at the boundary.** `StreamNodeSpecificationInputType` in `node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts` has no `JSON` member (only `StreamNodeSpecificationOutputType` does). A field that takes a JSON payload from the user is `STRING_LONG` with a `(JSON object)` / `(JSON array)` format hint; parse and validate it with `JSON.parse` plus a type guard at the top of `execute()`, and fail with a three-part error on invalid input (see `errors.md`).

**Exception — a generic HTTP-client node's request body.** That's the one case where `ANY` is preferable to `STRING_LONG`: when the caller may wire any upstream structure through untouched, `ANY` avoids the `JSON.stringify`-then-reparse round trip `STRING_LONG` would force. `STRING_LONG` is still correct there too when the engineer types the JSON by hand instead. See `wave-runtime.md` ("The request body input on a generic HTTP-client node") for the full reasoning — this exception does not extend to a domain node's fixed, named structured fields, which stay `STRING_LONG`.

**Why BOOLEAN is declarative, not imperative.** UX research on checkbox copy (NN/G, LogRocket, UX Movement) is consistent: label the affirmative *outcome* of checking, not the meta-action of choosing. `Choose whether to verify the TLS certificate` is three filler words plus a meta-question; `Verifies the TLS certificate before sending the request` tells the user exactly what the checked state does. The input *name* (`Verify TLS Certificate`) carries the imperative; the description carries the consequence.

**BOOLEAN — frame the affirmative state.** Even when the underlying flag is negative (`disable_tls_verify`, `skip_validation`), name the input and write the description in terms of what *checked* means. Never ship `Choose whether to disable …` or `Disables the …`. Flip the polarity at the spec/code boundary so the user sees the positive: name `Verify TLS Certificate`, default `true`, description `Verifies the TLS certificate before sending the request. When disabled, self-signed certificates are accepted.`

**BOOLEAN — add an impact line when the off-behavior is non-obvious.** If a user could reasonably misunderstand what happens when the box is unchecked, append a second sentence: `When disabled, …`. Two sentences is fine for BOOLEAN — the cost of an unclear toggle is high.

**STRING_MAP — don't restate the editor shape.** The UI already renders a key-value pair editor; writing `… as key-value pairs` duplicates the visual. Pick a noun that's inherently map-shaped (`HTTP headers`, `environment variables`, `query parameters`). Only describe the entry shape when the noun alone doesn't carry it.

**A `STRING_LONG` holding JSON — always declare the runtime shape.** A description that doesn't tell the user the expected shape forces them to read the example to learn the contract. Always end with the shape in parentheses: `(JSON object)`, `(JSON array)`, `(JSON object with fields "subject" and "body")`. Same rule applies for `ANY` — if you must use `ANY`, name the expected shape explicitly even though the type system is permissive.

**STRING_LIST — say "one or more"** in the opener so the user sees the multiplicity. If the spec accepts a delimited form (comma-separated, newline-separated), put that in the format-hint parenthetical at the end: `Enter one or more asset IDs (comma-separated)`.

**No trailing period for descriptions `[House style, MUST]`.** Applies to `specification.description`, every input `description`, every output `description`, and additional-connector descriptions. Rationale: these render as inline UI labels in Stream Designer, not paragraphs.

Good:
```ts
{ name: "Task name", description: "The display title for the task" }
```
Bad:
```ts
{ name: "Task name", description: "The display title for the task." }
```

**Format hints — always at the end, always in parentheses.** When the field expects a specific format (date pattern, unit of measure, allowed character set, encoding), the description ends with the format in parentheses. The format hint is *appended*, not woven in.

| Field | Description |
|---|---|
| Date input | `Enter the booking start date (YYYY-MM-DD)` |
| Duration in ms | `Enter the request timeout (in milliseconds)` |
| Base64-encoded payload | `Enter the file contents (base64-encoded)` |
| Comma-separated string | `Enter the asset IDs (comma-separated)` |
| Cron expression | `Enter the schedule (cron expression, e.g. "0 9 * * 1")` |
| Regex | `Enter the match pattern (JavaScript regular expression)` |

If the value has no format expectation (a plain ID, a free-text title), no parentheses — don't pad descriptions with empty parenthetical noise.

**A description should never need two parentheticals.** If you need to express both a unit and a constraint, put the unit in parentheses and move the constraint to a second sentence — but two sentences in a single input description usually means the input is doing too much; consider splitting it.

**When in doubt** — if the input is one of: a credential, a URL, a file path, a numeric tuning knob with a unit, a boolean toggle, a select among a closed set, or a date/regex/cron with a known format — the table above tells you the opener. If the input doesn't fit any of these, pick the closest match and flag it in your PR description so we can extend this table.

**URL-input pattern** for SaaS endpoints — name is the product name followed by the word `url` (no template — substitute the actual product name; sentence case per the casing rule).

| If the product is… | Input name | Input description |
|---|---|---|
| Jitbit | `Jitbit url` | `Enter the base url of the Jitbit instance` |
| MongoDB | `Mongodb url` | `Enter the base url of the MongoDB instance` |
| ClickUp | `Clickup url` | `Enter the base url of the ClickUp instance` |

**Sensitive-field pattern** — name is the authentication type itself in sentence case (`Api key`, `Bearer token`, `Password`). Description is `Enter the <auth-name> for the <product-name> API` — fill in both the literal auth type and the literal product name; never ship a description containing the words "auth type" or "Product".

| Authentication kind | Input name | Input description |
|---|---|---|
| API key for Jitbit | `Api key` | `Enter the api key for the Jitbit API` |
| Bearer token for ClickUp | `Bearer token` | `Enter the bearer token for the ClickUp API` |
| Basic-auth password for an internal service | `Password` | `Enter the password for the Internal Service API` |

Type is always **`STRING_PASSWORD`** — every time, no exceptions. How the user supplies the value at runtime (a literal, an upstream *Get Secret* node, the output of another node, a stream variable) is up to them; your node's contract is simply *"this input is a credential string"*.

**Never copy vendor procurement or support copy into credential descriptions.** API docs often say keys are created in an admin panel, issued by an account manager, requested from sales, or enabled by customer success. That context belongs in implementation notes or onboarding docs, not in every node panel. The node description stays operational: `Enter the api key for the <Product> API`.

**Mandatory vs. advanced — be strict.** The Stream Designer renders mandatory inputs front-and-center and tucks `advanced: true` inputs under an "Advanced" accordion. Use this UI affordance deliberately:

- **`mandatory: true`** is *only* for inputs **strictly required to make the node run**: the URL of the endpoint, the file path to read, the API key to authenticate, the resource ID to look up. Without these, `execute()` literally cannot proceed.
- **`advanced: true`** is for everything else that's technically optional and might overwhelm a first-time user: tuning knobs (timeout, retries, max tail), behavior toggles (follow-redirects, fail-on-non-2xx, dry-run, ignore-invalid-ssl), edge-case payload fields, niche format options. These have sensible defaults; experienced users open the accordion when they want to tune.
- **Neither flag** (`mandatory: false`, no `advanced`) is for *common-but-optional* inputs the user is likely to want visible — a request body that's omitted for GETs, an optional name for the created resource. Use sparingly; if every input is "visible by default", the accordion never helps. When in doubt: mandatory if literally required, advanced if a sensible default exists, in-between only for common-and-optional.

The goal is a panel that opens to **just** what's required, with everything else one expand away. Twelve visible fields on a node that needs three is a UX failure even when each is technically optional. House style — applied unless the user opts out.

**Default values** for advanced inputs: pick a defensive default that works for 90% of cases (timeout 30s, retries 3, follow-redirects true).

**Search and list visibility.** A search node must expose at least one meaningful search/filter input outside Advanced unless the node intentionally lists all resources. Credentials alone are not a usable visible surface. Common filters that drive the user's main workflow (`Search query`, `<Entity> id`, `<Parent entity> id`, `Tag ids`, `Date range`) are visible optional or mandatory depending on whether the action can run without them; tuning knobs remain Advanced.

**Pagination is not a default input surface.** API pagination fields (`Page`, `Per page`, `Offset`, `Cursor`, `Next token`, `Limit`) are implementation details unless the node gives workflow engineers a real way to iterate. Do not expose `Page` just because the API accepts it; in a one-shot node, users cannot naturally advance pages at runtime. Prefer one of these designs:

- Internal defaults (`page=1`, service default page size) when first-page results are enough.
- `Max results` as an advanced input when the API supports a simple size cap and the node still runs once.
- An additional connector / iterator node that emits items or pages when processing all results is the user goal.
- Explicit manual page/cursor inputs only when the user asks for that control or the stream design already has a counter/cursor source.

**BOOLEAN inputs are a special case — always declare a `defaultValue`, never use `mandatory: false`.** Stream Designer renders a boolean as a checkbox, which has no unset state for the user to leave blank; an absent default leaves the field meaning ambiguous and resolves to `undefined` in `execute()` despite the UI showing an unchecked box. See [`input-type-rules.md#boolean`](./input-type-rules.md#boolean) for the full rule, the polarity-flip pattern, and the TS-typing follow-up.

**Examples are mandatory.** Use realistic values, not placeholders. The standard placeholder set:

| Field type | Placeholder |
|---|---|
| First name | `helmut` |
| Last name | `cloud` |
| Full name | `helmut cloud` |
| Email | `hi@helmut.cloud` |
| Filename | `helmut` |
| File path (Windows) | `C:\helmut\cloud\helmut.txt` |
| File path (Unix) | `/Users/helmut/cloud/helmut.txt` |
| URL | `https://helmut.cloud/` |
| Phone | `+1 555 0100` |
| UUID | `2e1d01be-fc17-4acd-a3d9-ddacedebc59f` |
| ISO date | `2024-04-15T10:00:00Z` |

For multi-line code and complex JSON (`STRING_LONG` on inputs; `JSON` is output-only — see "No `JSON` input type" above), no placeholder is needed — make the example realistic-looking content.

## Outputs

**Names:** Sentence case (per the unified casing rule at the top of this file) — *Booking id*, *Project details*, *Status code*, *Response headers*, *Task url*. Same casing rule as inputs and node names; sentence case is now consistent across all user-visible strings.

### Curated output reasoning `[House style, MUST]`

Picking outputs is an **act of editorial judgment about what's wireable downstream**, not a mechanical translation of the API response. Before declaring outputs, the agent **MUST** reason about each field in the response and decide whether it earns curated status (its own top-level output) or belongs in the raw entity object.

#### Wireability tests — a response field earns curated status when it passes one or more

| Test | Question | Typical curated output |
|---|---|---|
| **Primary identifier** | Is this the resource's ID that downstream nodes will use to act on it again (update, delete, comment, link)? | `<Entity> id` — almost always curated for Create / Get |
| **External link** | Does the response carry a URL pointing to the resource that humans or notifications consume? | `<Entity> url`, `<Entity> share url` |
| **Branchable state** | Is there an enum-like field workflow engineers will condition stream branches on? | `<Entity> status`, `<Entity> priority`, `<Entity> type` |
| **Cardinality** | Is this a collection response? Collections always expose a count for branching on "did we get any?" | `Total count` for any list/search endpoint |
| **Stable typed primitive** | Is the value a stable typed primitive (STRING/NUMBER/BOOLEAN) the user can wire directly without parsing? | counts, flags, timestamps, simple IDs |
| **Authoritative value** | Did the server compute something the client cannot (final cost after taxes, normalized email, generated slug, resolved foreign key)? | `Computed total`, `Resolved email`, `Generated slug` |

#### Do-not-curate — these belong in the raw entity object, not as their own outputs

- **Nested complex objects** (objects-within-objects, arrays-of-objects). Curated outputs are wire-ready primitives; complex shapes belong in the raw entity where downstream nodes can drill in via wildcard paths.
- **Server-internal IDs** — trace IDs, request IDs, internal version stamps, debug tokens. These are diagnostic, not entity state.
- **Fields derivable from another curated output.** If you already expose `Task id`, don't also expose `Task short id` when one is a substring of the other.
- **Conditional / optional fields.** Fields that exist only under certain branches of the response shape. Raw entity exposes them at the wildcard level without committing the output contract to their presence.
- **Fields no workflow engineer would reasonably wire.** Creator metadata, last-modified-by, internal categorization tags that exist mainly for reporting. If you can't picture a stream needing it downstream, raw is enough.

#### Discovery and search chains `[House style, MUST]`

For catalogs where users discover a resource and then act on it, list/search nodes must expose the identifiers and links needed by likely downstream nodes. Do not force the workflow engineer to parse raw JSON for the main chain.

Typical curated outputs:

| Upstream node | Downstream need | Curated outputs to consider |
|---|---|---|
| List/search parent resources | Create/list child resources | `<Parent entity> id` or `<Parent entity> ids` |
| Search taxonomy/tags/labels | Filter another search or update an entity | `<Taxonomy entity> ids` |
| Search media/assets/files | Download, notify, transform, fetch details | `<Entity> id(s)`, `<Entity> url(s)` |
| Search users/customers/accounts | Assign, update, notify, fetch details | `<Entity> id(s)`, branchable status/type |

Arrays of primitive identifiers should use `STRING_LIST` when the IDs are strings and `JSON` only when the runtime shape is genuinely mixed or numeric. A raw `<Entities>` array is still included as the escape hatch; it is not a substitute for the primary IDs in the common workflow.

#### The anti-default to forbid by name `[House style, MUST NOT]`

**The mechanical-HTTP-wrapper anti-pattern**: shipping `Status code` + `Response body` + `Curl` as the output schema for every node that calls an HTTP API. This signals that the agent skipped the reasoning step and treated the node as a generic HTTP transport instead of an entity-meaningful action. Three specific failures it embeds:

- **`Status code` is not a default curated output.** The house convention is "throw to Fail on non-2xx" (see `errors.md`), so the success path implies 2xx — status code on success is uninformative. The only legitimate case for exposing `Status code` is a node that *intentionally* doesn't fail on non-2xx (e.g., a generic HTTP-client node with a `Fail on non-2xx` toggle the user can disable). For domain nodes that wrap a specific endpoint, omit it.
- **`Response` / `Response body` / `Result` / `Data` / `Body` are forbidden raw-output names on domain nodes.** Domain nodes wrap a specific endpoint, so they always have an entity: the raw output **MUST** be the singular or plural **entity noun** (`Task`, `Tickets`, `Project`, `Customer`, `Order items`). Generic HTTP-plumbing names leak the transport layer into the entity surface and produce inscrutable wildcard paths downstream (`{{node.x.output.Response body.id}}` instead of `{{node.x.output.Task.id}}`). **Exception — generic HTTP-client nodes** (the same nodes that are exempt from the `Status code` ban above): these have no entity by design, so `Response body` or `Body` is the only honest name for the raw output. The exemption applies only to nodes whose purpose is "make an arbitrary HTTP call" — if the node wraps a specific resource, it has an entity, and the entity-noun rule applies.
- **Three identical outputs across N nodes is a signal you skipped the per-node reasoning.** When `enum Output` is identical across multiple nodes in the same catalog, double-check: each node returns a different *entity* — the raw output name, at minimum, must differ.

#### Curated-output count heuristic

- **0 curated outputs** — only acceptable when the response is genuinely opaque (file blob, raw event payload, pure side-effect endpoint with no return data). Requires an explicit one-sentence justification to the user.
- **1–2 curated outputs** — typical for simple CRUD. Create returns `<Entity> id` + raw entity. Get returns a curated field + raw entity.
- **3–4 curated outputs** — rich resources where multiple primitives are wireable (`Task id`, `Task url`, `Task status`, raw `Task`).
- **5+ curated outputs** — probably over-curating. Push the marginal ones to the raw entity. Workflow engineers can still reach them via wildcard paths (`{{node.x.output.Task.foo.bar}}`). This isn't a hard cap (unlike Gate 1's input count), but pause at 5+ and ask "is this one really worth a top-level wire, or does it belong in the raw entity?"

#### Bad / good example

**Bad** (mechanical-HTTP-wrapper anti-pattern — what to never ship):

```ts
// Six nodes wrapping the same SaaS API, each with this identical output set:
enum Output {
    STATUS_CODE = "Status code",
    RESPONSE_BODY = "Response body",
    CURL = "Curl",
}
```

Why it fails: status code adds nothing on the success path; `Response body` discards the entity noun; identical outputs across six nodes means no per-node identity. Workflow engineers wiring downstream cannot tell from the wildcard picker whether this node returns a team, a list, or a task.

**Good** (per-node reasoning, entity-meaningful):

```ts
// CreateTask — POST returning the new task
enum Output {
    TASK_ID = "Task id",         // primary identifier — downstream uses to update/delete
    TASK_URL = "Task url",       // external link — wired into notifications
    TASK = "Task",               // raw response — escape hatch for any field
    CURL = "Curl",
}

// ListTasks — GET returning a collection
enum Output {
    TOTAL_COUNT = "Total count", // cardinality — branch on "did we get any?"
    TASKS = "Tasks",             // raw response (the array itself is the data)
    CURL = "Curl",
}

// UpdateTaskStatus — PATCH returning the updated task
enum Output {
    TASK_ID = "Task id",         // echoed identifier — chain into next call
    TASK_STATUS = "Task status", // branchable state — condition downstream on result
    TASK = "Task",               // raw response
    CURL = "Curl",
}
```

Each node owns its `enum Output`. The raw output is named for the entity it returns. Curated fields exist because they pass a wireability test, with the reasoning visible in the comment.

### Output ordering for API-calling nodes `[House style, MUST]`

Three tiers, in this order — curated outputs, raw response object, `Curl` (when present).

1. **Curated outputs first** — the fields workflow engineers wire downstream in the common case, picked via the wireability tests above.
2. **Raw response object next** — full response, typed `JSON` (or `ANY` if the shape genuinely varies). Conventional name: the singular or plural entity noun (`Task`, `Tickets`, `Project`, `Customer`). This gives workflow engineers an escape hatch when they need a field the curated outputs don't cover, and prevents a breaking version bump every time someone needs an obscure field.
3. **`Curl` last, when the node has one** — diagnostic, not data. It's a shell command for reproducing the call in `curl` / Postman, distinct from the data outputs above. Grouping it at the tail keeps the data outputs visually together in the Stream Designer panel. Only nodes that build and send their own HTTP request via `wave.axiosHelper` have a `Curl` output at all — see below.

Example for a `CreateClickUpTask` node:

```ts
enum Output {
    TASK_ID = "Task id",
    TASK_URL = "Task url",
    TASK = "Task",   // raw response, JSON
    CURL = "Curl",   // diagnostic — MUST be last
}
```

Adding new curated outputs that were previously only accessible via the raw response object is **not breaking** — the raw output already exposed the data. See `references/changelog-and-versioning.md`.

### Outputs are per-node — never extracted into a shared catalog-level constant `[House style, MUST NOT]`

When a catalog contains multiple nodes wrapping the same API, the DRY instinct is to extract `OUTPUTS = [...]` or `enum SharedOutput { ... }` into a catalog-level helper file and reference it from every node. **MUST NOT** do this. Each node's `enum Output` is a per-node user-facing contract: it's the lookup key for typed wildcards (`{{node.<uuid>.output.<name>}}`), the shape the ESLint `node-specification` rule validates per-node, the versioning boundary (bumping `specification.version` is per-node), and what Stream Designer renders in the wildcard picker labeled per-node.

Sharing belongs in the **helper layer**, never the spec layer:

- **Allowed:** one `<product>-client.ts` doing HTTP; one `setStandardOutputs(node, body, curl)` helper that takes per-node `enum Output` references and calls `setOutput`; one `redactCurl(config)` utility.
- **Forbidden:** `export const PRODUCT_API_OUTPUTS = [...]`, `export enum SharedOutput { ... }`, any pattern where the *names or types* of outputs are declared once and reused across node specs.

See also the top-level principle in SKILL.md: *"Specs are products, not code."*

**Do not declare a `Run time` output.** The engine measures node duration automatically and exposes it as the wildcard `node.<uuid>.info.runTime` — the `NodeInfo` type carrying it is declared in `node_modules/hcloud-sdk/lib/interfaces/high5/space/event/stream/node/index.d.ts`, and the resolver that makes it reachable is `node_modules/wave-engine/utils/WildcardResolver.js` `(engine, verified 2.0.1)`. Declaring it as a node output duplicates the engine field and forces every node author to time their own `try/finally`. When reworking a legacy node that declares `Run time`, propose removal, add a normal non-breaking changelog entry describing it, and verify the spec no longer contains the output entry.

**Always include a `Curl` output on axios-based HTTP nodes.** Any node that builds and sends its own HTTP request via `wave.axiosHelper` ships a `Curl` output of type `STRING` (the value is a shell command, not JSON). Build it with `this.wave.axiosHelper.convertRequestToCurl(requestConfig)`. **Redact credentials** to a placeholder before building the curl — never embed the real bearer token or API key in the output:

```typescript
const safeCurl = this.wave.axiosHelper.convertRequestToCurl({
    ...requestConfig,
    headers: {
        ...requestConfig.headers,
        Authorization: requestConfig.headers?.Authorization ? "Bearer <your-token>" : undefined,
    },
});
this.wave.outputs.setOutput(Output.CURL, safeCurl);
```

Why this matters: workflow engineers use the `Curl` output to reproduce the exact call in Postman or `curl` on their own machine when debugging discrepancies between the node's behavior and the API's expected response. Without it, debugging a "the node returned 500" issue means guessing at headers and body shape. Treat this as non-negotiable for nodes that own their own axios request.

**Exception — `multipart/form-data` requests.** `this.wave.axiosHelper.convertRequestToCurl` does not support form data — its own JSDoc says so explicitly (`node_modules/wave-engine/helpers/Wave.d.ts`), and the implementation `JSON.stringify`s `config.data`, which produces a useless string for a `FormData` body. For a node whose request is `multipart/form-data`, either omit the `Curl` output and note the limitation in the wavedoc, or hand-build a best-effort curl string with `-F` flags instead of calling the helper.

**Nodes that call through an SDK client don't have a `Curl` output at all.** A node wrapping `hcloud-sdk`, `@aws-sdk/client-s3`, or any other vendor SDK never builds an `AxiosRequestConfig` itself — the SDK constructs and sends the request internally, so there's nothing to pass to `convertRequestToCurl`. Don't invent a curl string by hand for these; document what the node calls (sdk method, resource) in the wavedoc instead. See `hcloud-sdk-usage.md`.

### Per-HTTP-method output archetypes `[House style, MUST]`

Five archetypes, one per CRUD operation. Each is **prescriptive**, not a suggestion — every API-calling node falls into one of them. Follow the three-tier ordering (curated → raw → `Curl`) within each archetype. The raw object always uses the entity noun (singular for single-resource responses, plural for collections). The `Curl` column applies only to nodes that build and send their own HTTP request via `wave.axiosHelper`; an SDK-client node (hcloud-sdk, an AWS SDK, etc.) stops at the raw object — see "Nodes that call through an SDK client" above.

| Archetype | Minimum outputs (in order) | Add curated fields when … |
|---|---|---|
| **List / collection (GET many, search, paginated)** | `Total count` (NUMBER) → `<Entities>` (JSON array, raw) → `Curl` (axios nodes only) | rarely — the array is the data; a count is enough for branching |

Two fixed points in the List row that get drifted on: the count is named `Total count` on every list node, never `<Entity> count` (`Secret count`, `Project count` are wrong; lint `total-count-output-name` flags them), and the raw `<Entities>` array is always present even when the prompt only asked for one field — a curated `<Entity> names` list is an addition, not a replacement.

| Bad | Good |
|---|---|
| `Secret count` + `Secret names`, no raw array | `Total count` + `Secret names` + `Secrets` |
| **Get one (GET single resource)** | one curated field passing the wireability tests → `<Entity>` (JSON, raw) → `Curl` (axios nodes only) | the response carries multiple branchable primitives (status, type, owner) |
| **Create (POST returning the new resource)** | `<Entity> id` (STRING) → `<Entity>` (JSON, raw) → `Curl` (axios nodes only) | the response includes a URL, a server-computed value, or a status the user will wire downstream |
| **Update (PUT/PATCH returning the updated resource)** | `<Entity> id` (STRING, echoed) → `<Entity>` (JSON, raw) → `Curl` (axios nodes only) | the change affects a branchable field (status, state) that downstream nodes should condition on |
| **Delete (DELETE, typically empty response)** | `Deleted <id or name>` (STRING, echoed: whichever field the node used to address the resource — `Deleted id`, `Deleted bucket`, `Deleted event name`) → `Curl` (axios nodes only) | the API returns confirmation data beyond the identifier (rare — most DELETEs return 204), or a branchable outcome such as an S3 delete marker |

The `Curl` output, when present, is **type STRING** (not JSON — the value is a shell-runnable string). Build it via `this.wave.axiosHelper.convertRequestToCurl(requestConfig)`.

**Worked examples** (replace `<Entity>` with the actual singular noun for the resource — `Task`, `Ticket`, `Order`, `Customer`, etc.):

```ts
// List archetype — GET /tasks
enum Output {
    TOTAL_COUNT = "Total count",
    TASKS = "Tasks",        // raw response (the array)
    CURL = "Curl",
}

// Get one archetype — GET /tasks/:id (with branchable status field)
enum Output {
    TASK_STATUS = "Task status",  // curated: branchable
    TASK = "Task",                // raw response
    CURL = "Curl",
}

// Create archetype — POST /tasks (response includes URL)
enum Output {
    TASK_ID = "Task id",    // curated: primary identifier
    TASK_URL = "Task url",  // curated: external link
    TASK = "Task",          // raw response
    CURL = "Curl",
}

// Update archetype — PATCH /tasks/:id (response state-changing)
enum Output {
    TASK_ID = "Task id",          // curated: echoed identifier
    TASK_STATUS = "Task status",  // curated: branchable result state
    TASK = "Task",                // raw response
    CURL = "Curl",
}

// Delete archetype — DELETE /tasks/:id (204 no content)
enum Output {
    DELETED_ID = "Deleted id",   // curated: echoed identifier confirming which record was removed
    CURL = "Curl",
}
```

**The archetype is not a hard ceiling** — these are the *minimum* curated outputs per archetype. Add curated fields by applying the wireability tests above; never add fields just because the API returns them. Equally, **don't drop below the minimum**: a Create node without `<Entity> id` is missing the primary identifier downstream nodes need to chain.

**Description format** mirrors the archetype. Templates per archetype (curated first, then raw, then Curl):

| Archetype | Description templates |
|---|---|
| List | curated: `Returns the number of <entities> in this response for empty-result branching` • raw: `Returns the full array of <entities> from the API response` |
| Get | curated: `Returns the <field> of the retrieved <entity>` (per curated field) • raw: `Returns the full <entity> object from the API response` |
| Create | curated: `Returns the ID of the newly created <entity>`, `Returns the URL of the newly created <entity>`, … • raw: `Returns the full <entity> object from the API response` |
| Update | curated: `Returns the ID of the updated <entity>`, `Returns the resulting <field> of the updated <entity>` • raw: `Returns the full <entity> object from the API response` |
| Delete | curated: `Returns the id of the deleted <entity>` • Curl (axios nodes only): `Returns the curl command equivalent of the request` |

All output descriptions are declarative (start with `Returns the …`), no trailing period (per the description rules above).

Descriptions must add meaning beyond the output name. Avoid legacy/passive filler like `Returns the total count of <entities> in the response` or `Returns how many <entities> were returned`; those repeat `Total count` without telling the user why the count exists. Prefer `Returns the number of <entities> in this response for empty-result branching`.

## Tone

Across descriptions: present tense, imperative for inputs ("Enter…", "Choose…"), declarative for outputs ("Returns…"). No first-person, no marketing copy, no exclamation marks. Clear and direct beats clever.

## Anti-patterns

- **`Get tickets`** (plural with `Get`) — ambiguous. Use `List tickets` for the collection; `Get ticket` is reserved for the singular retrieval.
- **Opening verb doesn't match the input type** — `Enter the HTTP method` on a `STRING_SELECT` (should be `Choose the HTTP method`), `Choose the timeout` on a `NUMBER` (should be `Enter the timeout`), `Enter the TLS verification flag` on a `BOOLEAN` (should be declarative: `Verifies the TLS certificate before sending the request`). The opener is dictated by the type, not the author's preference.
- **BOOLEAN written as a meta-question.** `Choose whether to verify the TLS certificate` — three filler words plus instructions about making a choice. Use declarative outcome: `Verifies the TLS certificate before sending the request`.
- **BOOLEAN framed in the negative.** `Disables TLS verification`, `Skips schema validation`, `Choose whether to disable …`. Flip the polarity at the spec boundary so the input describes the affirmative state.
- **STRING_MAP description restates the editor shape.** `Enter the HTTP headers as key-value pairs` — the UI already shows a key-value editor; the suffix is noise. House style: `Enter the HTTP headers`.
- **JSON-payload description that doesn't declare the shape.** `Enter the request payload` on a `STRING_LONG` input holding JSON — forces the user to inspect the example. Always end with `(JSON object)` / `(JSON array)` / `(JSON object with fields …)`.
- **Trailing period on a fragment.** `Enter the timeout (in milliseconds).` — the description is a fragment, not a sentence. Drop the period.
- **Format hint woven into the sentence** — `Enter the start date in YYYY-MM-DD format` (verbose). House style: `Enter the start date (YYYY-MM-DD)`. Format hints live in parentheses at the end.
- **No format hint when one is needed** — `Enter the timeout` on a NUMBER input that expects milliseconds. Always end with the unit: `Enter the timeout (in milliseconds)`. Same for any field with a non-obvious format.
- **Description over 120 chars.** Hard cap. If you can't say it in 120, split the input. Aim for 60–80 — research links scannable concise text to ~58% usability improvement.
- **`HTTP Request Sender Node`** — `Node` suffix is noise; "Sender" is redundant with the verb. *HTTP Client* or *Send HTTP Request* if the verb matters.
- **Input description that just repeats the input name** ("URL — The URL"). Spend a sentence on *what to put in it* and *what format*.
- **Placeholder example values** (`"<your-token>"`, `"example.com"`). Use realistic values from the placeholder set.
- **Sensitive input typed as `STRING` instead of `STRING_PASSWORD`.** Means the value renders in plaintext in the Stream Designer UI and logs.
- **Any user-visible string in Title Case or with preserved acronyms** (`Status Code`, `Task ID`, `Task URL`, `API Key`). House style is sentence case (`Status code`, `Task id`, `Task url`, `Api key`). Applies to inputs, outputs, node names, categories, STRING_SELECT options. Override is fine if the user opted out.
- **Declaring a `Run time` output.** The engine emits node runtime as `node.<uuid>.info.runTime` automatically — declaring it in the spec duplicates engine state.
- **Long node descriptions** (>85 chars). The UI truncates. One short sentence.

## Curiosity hooks

- The CRUD verb table comes from years of catalog drift — earlier work mixed `View`/`Read`/`Retrieve`/`Show` for the same operation. One verb per operation type keeps the catalog navigable. `Get` won out for singular retrieval because it matches the underlying HTTP verb and is the term every API consumer already uses; `List` stays distinct for collections to avoid the `Get Tickets` / `Get Ticket` collision.
- Sentence case is now unified across all user-visible strings (inputs, outputs, node names, categories) — an earlier version of this file used Title Case for inputs and sentence case for outputs, which produced inconsistent labels in dense panels and a recurring "is this an acronym here or not?" judgment call. The unification removes that decision; lint enforces it.
- For non-CRUD nodes, the temptation is to invent unique verbs. Resist — pick from the vocabulary list above. New verbs cost catalog consistency.

## Character limits (soft warnings)

The platform does **not** enforce these — the agent does, as a UI courtesy. Override if the user opts out of house style. **These numbers are UI-observed, not verified against any hcloud-sdk or wave-engine type** — nothing in `node_modules` declares a max length for these fields — so treat the table below as the single place these figures live; every other reference in this skill should cite this table rather than restate a number.

| Field | Hard max | Recommended |
|---|---:|---:|
| Node name | 30 | ≤ 20 |
| Node description | 85 | ≤ 70 |
| Category | 30 | ≤ 20 |
| Input name | 30 | ≤ 25 |
| Input description | 120 | ≤ 100 |
| Output name | 30 | ≤ 20 |
| Output description | 120 | ≤ 100 |
| Additional connector name | 30 | ≤ 20 |
| Additional connector description | 120 | ≤ 100 |
| Author name / company / email | 60 each | — |
| Changelog entry (per item) | 120 | ≤ 100 |
