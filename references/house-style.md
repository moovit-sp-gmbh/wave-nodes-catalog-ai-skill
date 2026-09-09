Generated from style/rules.json — do not edit by hand; run `scripts/style.mjs generate`

# House style

These rules are a prescriptive target for new and reworked wave nodes, not a description of what any existing catalog already looks like.

An override for a house-style rule lives in one file the user creates at their catalog root: `create-high5-nodes.config.json`. Engine rules cannot be overridden.

This file is an index only. The "Where" column points to the reference file and section that carries the rationale and code examples for each rule — read the rule's `source` before applying or disputing it.

## Engine rules (always apply)

| Id | Rule | Scope | Enforced by | Options | Where |
|---|---|---|---|---|---|
| `boolean-default-required` | BOOLEAN inputs always declare a defaultValue | input-type | lint (`boolean-default-required`) | — | `references/input-type-rules.md#boolean` |
| `example-required` | Every input and output declares an example | spec | lint (`example-required`) | — | `references/specification.md#input-optional-fields` |
| `input-output-description-required` | Every input and output declares a description | spec | typecheck | — | `references/specification.md#v3-fields-the-default-for-new-nodes` |
| `spec-version-v3` | New nodes declare specVersion 3 | spec | agent | — | `references/specification.md#pick-a-spec-version` |
| `enum-io-names` | Name inputs and outputs through a local enum | spec | agent | — | `references/house-style-vs-user-style.md#whats-engine-mandatory-not-overridable` |
| `credentials-string-password` | Credential inputs are always STRING_PASSWORD | input-type | agent | — | `references/secrets-and-auth.md#declaring-a-credential-input` |
| `no-log-string-password` | Never log a STRING_PASSWORD value | security | agent | — | `references/errors.md#the-pattern-in-code` |
| `no-secret-store-in-execute` | Never call the secret store from execute() | security | agent | — | `references/secrets-and-auth.md#the-node-authors-rule-accept-credentials-as-inputs` |
| `throw-to-fail` | Throw to fail; never invent an error output | error-message | agent | — | `references/errors.md#how-the-engine-handles-errors` |
| `no-shell-string-injection` | Never pass resolved input into a shell string | security | agent | — | `references/shell-injection-and-process-execution.md#the-nodejs-apis-ranked-by-safety` |
| `additional-connectors-mid-execution-only` | Additional connectors fire only mid-execution | process | agent | — | `references/errors.md#terminal-outcomes--throw-to-fail-always` |
| `no-class-self-reference` | Never reference a node class by its own name inside its body | process | lint (`no-class-self-reference`) | — | `references/testing-and-debugging.md#1-unit-tests-on-pure-helpers-jest` |

## House style (prescriptive target, overridable)

| Id | Rule | Scope | Enforced by | Options | Where |
|---|---|---|---|---|---|
| `wavedoc-sidecar-required` | Every node ships a wavedoc sidecar | documentation | agent | — | `references/house-style-vs-user-style.md#whats-engine-mandatory-not-overridable` |
| `sentence-case-names` | User-visible names use sentence case | spec | lint (`sentence-case-names`) | `{"allow":[]}` | `references/naming-and-style.md#casing--sentence-case-for-all-user-visible-strings-house-style-must` |
| `no-trailing-period-description` | Descriptions never end with terminal punctuation | description | lint (`no-trailing-period-description`) | — | `references/naming-and-style.md#no-trailing-period-for-descriptions-house-style-must` |
| `curl-output-last` | A Curl output must be the last output | output-order | lint (`curl-output-last`) | — | `references/naming-and-style.md#output-ordering-for-api-calling-nodes-house-style-must` |
| `total-count-output-name` | A List node's count output is named "Total count" | output-name | lint (`total-count-output-name`) | `{"allow":[]}` | `references/naming-and-style.md#per-http-method-output-archetypes-house-style-must` |
| `input-entity-prefix` | Entity-property input names lead with the entity | input-name | agent | — | `references/naming-and-style.md#input-entity-qualification-house-style-must-for-entity-property-inputs` |
| `node-name-verb-noun` | Node names are <Verb> <Entity> | node-name | agent | — | `references/naming-and-style.md#node-names` |
| `category-plural-entity` | Categories are a pluralized entity, not a product name | category | agent | — | `references/naming-and-style.md#categories` |
| `node-description-template` | Node descriptions follow the per-verb template | description | agent | — | `references/naming-and-style.md#node-descriptions` |
| `description-is-label` | Descriptions are label fragments in the right register | description | agent | — | `references/naming-and-style.md#tone` |
| `input-description-conventions` | Input description opener and format hint follow the type | input-type | agent | — | `references/naming-and-style.md#descriptions-aim-for-6080-characters-hard-cap-120` |
| `machine-value-translation` | Expose human-typeable input, translate at the boundary | input-type | agent | — | `references/naming-and-style.md#machine-friendly-value-translation-house-style-must` |
| `input-count-triage` | Triage with the user past ~10 inputs | spec | agent | `{"maxInputs":10}` | `references/specification.md#curated-abstraction-not-transliteration` |
| `mandatory-vs-advanced` | Mandatory is for strictly-required inputs only | input-type | agent | — | `references/naming-and-style.md#mandatory-vs-advanced--be-strict` |
| `example-placeholder-values` | Examples use the standard realistic placeholder set | spec | agent | — | `references/naming-and-style.md#examples-are-mandatory` |
| `credential-and-url-input-naming` | Credential and URL inputs follow the standard templates | input-name | agent | — | `references/naming-and-style.md#url-input-pattern-for-saas-endpoints` |
| `search-and-pagination-inputs` | Search nodes need a filter; pagination isn't a default input | input-type | agent | — | `references/naming-and-style.md#search-and-list-visibility` |
| `outputs-curated-raw-curl` | Outputs order: curated, then raw entity, then Curl | output-order | agent | — | `references/naming-and-style.md#output-ordering-for-api-calling-nodes-house-style-must` |
| `curated-output-wireability` | Curate outputs by wireability, not by mechanical translation | output-name | agent | — | `references/naming-and-style.md#curated-output-reasoning-house-style-must` |
| `raw-output-entity-noun` | Raw output is the entity noun; Status code isn't default | output-name | agent | — | `references/naming-and-style.md#the-anti-default-to-forbid-by-name-house-style-must-not` |
| `no-shared-output-enum` | Never extract a shared Output enum across nodes | output-name | agent | — | `references/naming-and-style.md#outputs-are-per-node--never-extracted-into-a-shared-catalog-level-constant-house-style-must-not` |
| `curl-on-http-nodes` | Axios HTTP nodes always ship a Curl output | output-type | agent | — | `references/naming-and-style.md#always-include-a-curl-output-on-http-nodes` |
| `no-run-time-output` | Never declare a Run time output | output-name | agent | — | `references/naming-and-style.md#outputs-are-per-node--never-extracted-into-a-shared-catalog-level-constant-house-style-must-not` |
| `output-type-priority` | Pick the most specific output type before JSON | output-type | agent | — | `references/specification.md#picking-the-right-output-type--priority-rules` |
| `three-part-error-message` | Error messages have three parts: what, why, what to check | error-message | agent | — | `references/errors.md#the-three-part-error-message-pattern-house-style` |
| `node-protocol-imports` | Import Node builtins via the node: protocol | imports | agent | — | `references/typescript-best-practices.md#nodejs-builtin-imports-use-the-node-prefix-house-style` |
| `satisfies-over-as` | Prefer satisfies over as for spec literals | process | agent | — | `references/typescript-best-practices.md#satisfies-over-as-for-literals` |
| `stdlib-over-dependency` | Reach for stdlib and the wave-engine before a new dependency | dependencies | agent | — | `references/dependencies.md#the-four-question-test` |
| `action-not-endpoint` | Design the action, not the endpoint | spec | agent | — | `references/house-style-vs-user-style.md#whats-opinionated-house-style--overridable` |
| `helper-class-extraction` | Extract a domain helper class per wrapped external system | process | agent | — | `references/house-style-vs-user-style.md#whats-opinionated-house-style--overridable` |
| `file-conflict-handling` | OS-mutating nodes offer a conflict-rule input | input-type | agent | — | `references/house-style-vs-user-style.md#whats-opinionated-house-style--overridable` |
| `wavedoc-format-and-causes` | Wavedoc opens with "The <Title> node", lists Fail causes | documentation | agent | — | `references/node-documentation.md#tone-house-style` |
| `shell-command-hardening` | Harden every process-spawning node beyond "no shell strings" | security | agent | — | `references/shell-injection-and-process-execution.md#the-dont-block-protect-patterns` |
| `character-limits` | Respect the soft character-limit table | spec | agent | `{"maxNodeName":30,"maxDescription":85,"maxCategory":30,"maxInputName":30,"maxInputDescription":120,"maxOutputName":30,"maxOutputDescription":120,"maxConnectorName":30,"maxConnectorDescription":120,"maxAuthorField":60,"maxChangelogEntry":120}` | `references/naming-and-style.md#character-limits-soft-warnings` |

## Overridable options

Set these under the matching rule id in `create-high5-nodes.config.json`.

- `sentence-case-names`: `{"allow":[]}`
- `total-count-output-name`: `{"allow":[]}`
- `input-count-triage`: `{"maxInputs":10}`
- `character-limits`: `{"maxNodeName":30,"maxDescription":85,"maxCategory":30,"maxInputName":30,"maxInputDescription":120,"maxOutputName":30,"maxOutputDescription":120,"maxConnectorName":30,"maxConnectorDescription":120,"maxAuthorField":60,"maxChangelogEntry":120}`