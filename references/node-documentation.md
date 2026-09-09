# Node documentation — the wavedoc sidecar

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

**Every time you create or modify a node.** The sidecar `<NodeName>.md` is part of the node's public surface, not optional. When the `.ts` changes, the `.md` is updated in the same change set.

This file describes the format faithfully — including tone, audience, and validation checklist. `[House style]` rules are flagged; the underlying *presence* of a wavedoc file is engine-mandatory (the Stream Designer relies on it).

## Concept

Every node ships with a sidecar Markdown file next to its TypeScript file (abstract base classes that some catalogs keep under `lib/nodes/`, such as `ActionNode` or `ConditionNode`, are not nodes and get none):

```
lib/nodes/
├── MyNode.ts
└── MyNode.md       ← wavedoc sidecar
```

The wavedoc is the **user-facing reference** for the node. It documents *how the node behaves and how to use it*, in language a workflow engineer can read without looking at TypeScript. It serves two audiences:

- **Primary: workflow engineers in Stream Designer.** Non-technical users composing streams.
- **Secondary: AI agents** parsing the spec to understand the node's capabilities for code generation.

Both audiences benefit from a strict format: humans because it scans predictably, agents because it parses deterministically.

## Format

```markdown
::wavedoc
---
title: My Node
description: |
  The My Node node does the thing. One or more sentences describing what the node accomplishes, why someone would use it, and any important caveats or behaviors.
inputs:
  - name: Some Input
    description: |
      Short instruction in imperative second-person. Mention valid values, constraints, or formats.
    type: STRING
    mandatory: true
    example:
      - name: Example
        value: "helmut"
outputs:
  - name: Result
    description: |
      Returns the thing the node produced.
    type: STRING
    example:
      - name: Result
        value: "HELMUT"
connectors:
  - name: Success
    description: |
      Triggered when the thing happens successfully.
  - name: Fail
    description: |
      Triggered when the thing does not happen.
    causes:
      - name: Invalid Configuration
        description: |
          If the node is misconfigured or lacks necessary parameters.
      - name: Timeout
        description: |
          If the operation exceeded the configured timeout.
---
::
```

**Structural rules:**

- Open with `::wavedoc` on its own line, close with `::` on its own line. These delimiters are required.

  | Bad | Good |
  |---|---|
  | `## ::wavedoc` | `::wavedoc` |

  The first line of the file is exactly `::wavedoc` — a bare line, not a Markdown heading. `## ::wavedoc` fails the verify check.
- Inside, YAML between `---` fences with the fields below.
- Multi-line strings use the `|` (literal block) operator.
- 2-space indentation.

**Required top-level fields, in this order:**

1. `title` — the human-readable node name (e.g., "HTTP Client"). Matches `specification.name`.
2. `description` — multi-line. Opens with the literal phrase **The \[node title\] node**, with the actual title substituted (e.g., *"The HTTP Client node makes HTTP requests…"*, *"The Parse CSV Row node splits a CSV row…"*). Cover: primary functionality, key features, caveats, performance considerations, dependencies. Tone: declarative, present-tense. A node that calls through an SDK client (hcloud-sdk, a vendor SDK) has no `Curl` output, so this description is where the call is documented: name the client and the method, e.g. *"…uploads the object with `putObject` on the Acme storage client"* — a workflow engineer reading the doc must be able to tell which API call runs.
3. `inputs` — array. See below.
4. `outputs` — array. See below.
5. `connectors` — array. Always includes Success and Fail.

## Input entries

```yaml
- name: Input name              # Sentence case, matches the spec's input name exactly
  description: |
    Imperative second-person instruction. "Enter the X", "Choose the Y", "Select Z" — no trailing period.
    Include format hints, valid values, constraints.
  type: STRING                  # Wavedoc input vocabulary — see "Wavedoc type vocabulary" below
  mandatory: true               # or false
  advanced: false               # optional; default false; true hides under Advanced accordion
  example:                      # required, array of named examples
    - name: Example
      value: "helmut"
```

**For `STRING_SELECT`:**

```yaml
- name: Method
  description: |
    Choose the HTTP method. GET retrieves, POST submits, PUT replaces, PATCH partially updates, DELETE removes.
  type: STRING_SELECT
  mandatory: true
  options:
    - name: GET
      description: |
        Retrieve data from the server.
      default: true             # exactly one option carries default: true
    - name: POST
      description: |
        Submit data to be processed.
    - name: PUT
      description: |
        Replace existing data.
  example:
    - name: Method
      value: GET
```

**Multiple examples** are useful when behavior varies by platform / context:

```yaml
example:
  - name: Windows
    value: "C:\\helmut\\cloud\\helmut.txt"
  - name: Unix
    value: "/Users/helmut/cloud/helmut.txt"
```

## Output entries

```yaml
- name: Task id                   # House style: entity-noun output, not "Status code" — see naming-and-style.md
  description: |
    Returns the ID of the retrieved task.
  type: STRING                    # Wavedoc output vocabulary — see "Wavedoc type vocabulary" below (overlaps with, but isn't identical to, the input vocabulary)
  example:
    - name: Task id
      value: "abc123"
```

## Wavedoc type vocabulary

**Nothing in the engine or Agent parses the sidecar `.md` file** — it is a human/agent-readable convention, not a machine contract, so its `type:` field is prose, not the literal `StreamNodeSpecificationInputType` / `StreamNodeSpecificationOutputType` enum value from the `.ts` spec. The two type systems overlap but are not identical:

- **Attested** (verified against the blueprint's own `lib/nodes/HttpClient.md`): `STRING`, `STRING_LONG`, `STRING_MAP`, `STRING_SELECT`, `BOOLEAN` appear verbatim, matching their `.ts` enum names. But `HttpClient.md` writes its `NUMBER`-typed fields (`Timeout`, `Status Code`) as `INT`, and its `JSON`-typed `Body` output as `OBJECT` — neither `INT` nor `OBJECT` is a member of either hcloud-sdk enum (`node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts`); they're the blueprint author's own sidecar convention.
- **This skill's own convention** (not attested in any shipped sidecar, but consistent with the pattern above): `STRING_LIST`, `STRING_READONLY`, `STRING_PASSWORD`, `ANY`, `XML`, `HTML` — write these the same as their `.ts` enum name, since no blueprint example shows otherwise.

So the recommended wavedoc vocabulary is: `STRING`, `STRING_LONG`, `STRING_LIST`, `STRING_MAP`, `STRING_READONLY`, `STRING_SELECT`, `STRING_PASSWORD`, `INT` (not `NUMBER`), `BOOLEAN`, `ANY`, `OBJECT` (not `JSON`), `XML`, `HTML` — 13 names, matching the union of both real spec enums with the two attested substitutions applied. Note the input/output split from the `.ts` types still applies: `STRING_SELECT` and `STRING_PASSWORD` are input-only, `OBJECT`/`XML`/`HTML` are output-only — the wavedoc should still only use a type on the side the real spec allows it, even though nothing enforces that here.

## Connector entries

```yaml
connectors:
  - name: Success
    description: |
      Triggered when the operation completes successfully.
  - name: Fail
    description: |
      Triggered when the operation fails.
    causes:                       # Array of named failure reasons — house style
      - name: Network Issue
        description: |
          If the helmut.cloud agent is unable to establish a connection due to network problems.
      - name: DNS Resolution Failure
        description: |
          If the agent is unable to resolve the server's DNS name.
      - name: Invalid Configuration
        description: |
          If the node is misconfigured or lacks necessary parameters.
      - name: Timeout
        description: |
          If the operation exceeded the configured timeout value.
  - name: Some Additional Connector
    description: |
      Triggered when <condition>.
```

For a `Fail` connector, **enumerate causes**. Use the shared failure-cause vocabulary so users see the same categories across the catalog:

| Cause name | When to use it |
|---|---|
| `Network Issue` | Connection problems, transport-level failures |
| `DNS Resolution Failure` | The hostname can't be resolved |
| `Invalid Configuration` | Inputs are missing or malformed |
| `Invalid Input` | Inputs are present but content is wrong |
| `Timeout` | Operation exceeded the configured timeout |
| `Invalid SSL Certificate` | TLS verification failed |
| `Redirect Found` | A redirect was returned and following is disabled |
| `Response Parsing Error` | Response couldn't be parsed |
| `Non-2xx Response Code` | HTTP response outside 2xx range when fail-on-non-2xx is enabled |
| `Permission Denied` / `Permissions` | The agent/user lacks permission |
| `Asset Not Found` / `File Not Found` / `Not Found` | The target resource doesn't exist |
| `API Error` | Generic upstream API failure |
| `Invalid Code` | User-supplied code (Python, JS, etc.) didn't run |
| `Duplicate` | An item with the same identifier already exists |

Add new causes only when none of these fit.

**Casing is verbatim.** Use the cause names exactly as capitalized in the table above (`Invalid Configuration`, not `Invalid configuration`) — the sentence-case rule for other user-visible strings does not apply to these names.

For **additional connectors** (e.g., `Item`, `Progress`, `Chunk`), describe what fires the connector and which paired output carries the value. Note: additional connectors are for *mid-execution emissions* — loops, progress, streaming — not for terminal outcomes like "not found" or "rate limited", which belong on the `Fail` connector as causes. A connector entry itself has no `type` field (`StreamNodeSpecificationAdditionalConnector` in hcloud-sdk 16.0.0 declares only `name` and `description`); some are value-bearing in that a paired *output* carries the value with its own type (e.g., a `Progress` connector paired with an output typed `StreamNodeSpecificationOutputType.NUMBER` to stream a 0–100 percentage).

## Tone `[House style]`

- **Imperative second-person** for inputs: *"Enter…"*, *"Choose…"*, *"Select…"*. Tells the workflow engineer what to do.
- **Declarative for outputs and connectors**: *"Returns the…"*, *"Triggered when…"*. States what happens.
- **Present tense throughout.** Not "will return", "would trigger".
- **No first-person.** No "we", "I", "our".
- **No technical jargon the audience won't know.** *"Promise chain"*, *"callback hell"*, *"ts-node"*, *"transpile"* — out. *"Request"*, *"response"*, *"timeout"*, *"option"* — in.
- **No marketing language.** *"Powerful"*, *"seamless"*, *"world-class"* — out. *"Sends an HTTP request"*, *"writes the result to the output"* — in.

The opening sentence of every node description follows the form **"The \[actual node title\] node …"** — substitute the real title. Examples: *"The HTTP Client node makes HTTP requests…"*, *"The Iterate Folder node emits each file in a folder…"*. This consistency lets users scan a catalog quickly. Never ship a description containing the literal word "Title" or "Node Name" — those are placeholders, not text.

## Audience reminder

Two readers:

- **Workflow engineers** want to know *what to do* and *what happens*. They don't care about TypeScript types in the implementation; they care about input names, types in the wave sense, what the output looks like, and what causes failures.
- **AI agents** want a deterministic structure they can parse to reason about the node's behavior. The strict YAML and the failure-cause vocabulary help.

Don't write to a developer audience here — that's what the source code is for.

## Validation checklist

Run before considering a wavedoc done:

- [ ] File is `<NodeName>.md` directly next to `<NodeName>.ts` under `lib/nodes/`.
- [ ] Wrapped in `::wavedoc` / `::` delimiters.
- [ ] YAML between `---` fences is valid (paste into a YAML linter if unsure).
- [ ] Top-level fields appear in order: `title`, `description`, `inputs`, `outputs`, `connectors`.
- [ ] `title` matches `specification.name` in the TS file exactly.
- [ ] `description` opens with the literal phrase "The …" + the actual node title + " node …" — e.g., "The HTTP Client node makes HTTP requests…".
- [ ] Every input has `name`, `description`, `type`, `example`. Inputs additionally have `mandatory`. `STRING_SELECT` inputs have `options` with exactly one `default: true`.
- [ ] Every output has `name`, `description`, `type`, `example`.
- [ ] Every example value is realistic (real-looking data, no `<placeholder>` text).
- [ ] Multi-line strings use the `|` literal block operator.
- [ ] Indentation is 2 spaces.
- [ ] Connectors include `Success` and `Fail`. `Fail` has a `causes` array using the shared vocabulary where possible.
- [ ] Tone is imperative second-person for inputs, declarative for outputs/connectors, present tense throughout.
- [ ] No developer jargon. No marketing language. No first-person.
- [ ] Char-limit table in SKILL.md is respected.

## What every wavedoc must include `[House style, MUST]`

There is no "MVP wavedoc" license to ship less. Every wavedoc has the same required structure; depth scales with the node's intrinsic complexity, not with a tier label or catalog maturity.

**Always required, every wavedoc:**

- `title` — sentence-case node name
- `description` — one to three sentences opening with `The <Node title> node …`, present tense
- `inputs:` — one entry per input with `name`, `description`, `type`, `mandatory` flag, and a realistic `example`
- `outputs:` — one entry per output with `name`, `description`, `type`, and a realistic `example`
- `connectors:` — `Success` and `Fail` with one-line descriptions
- `Fail` connector `causes:` — **one entry per distinct error class the node can throw** (auth failure, not-found, validation, network, timeout, API error, etc.). Each cause carries a one-sentence trigger description. A node that fails one way has one cause; a node that fails in five distinct ways has five causes. There is no exemption for "small nodes" — if the `execute()` body has multiple `throw new Error(...)` paths with different categories, each is a cause.

**Required when the node has them — depth driven by the node, not by tier:**

- **Multi-line input/output descriptions** — when the field has format constraints, edge cases, or non-obvious behavior (an input that accepts ISO 8601 *or* epoch ms, an output that's `null` in certain branches, a `STRING_SELECT` where one option does something unusual). Cover the edge case in the description; don't make workflow engineers reverse-engineer it from `execute()`.
- **Multiple examples per field** — when one example doesn't represent the realistic value range (e.g., both a singular and a plural case for a list-typed field, both an authenticated and an anonymous form for a credential).
- **Cross-references to related nodes** — when the typical stream chains this node with siblings in the same catalog (Create → Update, List → Get one). One sentence in the description naming the chain.

**The standard does not change between fresh catalogs and published catalogs.** If a fresh catalog ships a node that legitimately has only one failure mode, its wavedoc has one cause — that's complete, not "MVP". If a published catalog ships a node that fails in six distinct ways, its wavedoc has six causes — that's complete, not "extra polish". The wavedoc's depth is determined by *the node*, not by where the catalog sits on the release ladder.

## Update trigger

Any change to the node's `.ts` that affects its public surface (input/output/connector additions, renames, type changes, behavior changes) **requires updating the `.md` in the same change set**. The skill's design checklist surfaces this as a non-skippable step.

Specifically:

- **Add an input** → add an `inputs:` entry with description, type, example, mandatory.
- **Add an output** → add an `outputs:` entry.
- **Add an additional connector** → add to `connectors:`.
- **Rename anything** → update `name`, references in description, and any failure-cause names that referenced it.
- **Change behavior in a way users perceive** → update `description` and possibly `causes`.

## Anti-patterns

- **Forgetting the sidecar.** New node ships without `.md`. Stream Designer has nothing to show users; users guess.
- **Wavedoc drift.** Node behavior changes in `.ts`; `.md` lags. The skill must catch this — when a node is edited, the `.md` is updated.
- **Generic descriptions.** *"This node makes a request."* Tell the user *what* request, *to what*, *for what purpose*.
- **Placeholder examples.** `value: "<your-token>"`, `value: "example"`. Use the placeholder set from `naming-and-style.md`: *helmut*, *cloud*, *hi@helmut.cloud*.
- **Documenting implementation.** *"Uses axios with timeout 30s by default."* The user doesn't care that it's axios. Say what they observe: *"Waits up to 30 seconds for a response, then times out."*
- **Tone drift.** Mixing imperative ("Enter the URL.") with declarative ("The URL field accepts a URL.") inside one description. Pick one (imperative for inputs).
- **Skipping `causes`.** A `Fail` connector with no `causes` is opaque. List the probable failure modes using the shared vocabulary.

## Curiosity hooks

- The `::wavedoc` / `::` delimiters are deliberately unusual so the format is unambiguous even when embedded in a Markdown file that contains other content (it's possible to put non-wavedoc Markdown around the block, though most node docs are wavedoc-only).
- The shared failure-cause vocabulary is the closest thing the platform has to a controlled error taxonomy. Reusing causes is good for users (predictable categories) and good for AI agents reading the doc (deterministic interpretation).
- An AI agent reading the wavedoc gets a clean, structured spec that mirrors the spec object in the TS file but in human-readable prose. That's intentional — it's the version of the spec that doesn't require running the TypeScript compiler to understand.
