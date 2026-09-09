# Contract review template

Paste this block to the human once `../procedures/node-contract.md` has settled every section. It's the single approval gate before any file is written — one "approve" (or equivalent) covers the whole block.

## Fill-in template

    ## <Node name> — contract review

    **Category:** <Category>
    **Description:** <one-line description>
    **Engine:** wave-engine <version> (installed — see check-env)

    **Inputs:**

    | Name | Type | Mandatory / Advanced | Example | Why |
    |---|---|---|---|---|
    | <Input name> | <TYPE> | Mandatory | <example value> | <one-line reason> |

    **Outputs:**

    | Name | Type | Holds |
    |---|---|---|
    | <Output name> | <TYPE> | <what the field contains and why it's wired> |

    **Connectors:** Success / Fail<, plus any additional connector and what fires it>

    **Failure cases:** <one three-part message per distinct failure>

    **Assumptions made:** <anything decided without asking, stated plainly — including "no reply was possible, defaults used" when that applies>

    **House-style choices in effect:** <any rule the human already overrode this session, or "defaults, no overrides">

    Reply approve, or tell me what to change.

## Worked example

    ## GetTicket — contract review

    **Category:** Tickets
    **Description:** Look up a ticket in Jitbit
    **Engine:** wave-engine 2.0.1 (installed — see check-env)

    **Inputs:**

    | Name | Type | Mandatory / Advanced | Example | Why |
    |---|---|---|---|---|
    | Api key | STRING_PASSWORD | Mandatory | `sk_live_...` | Authenticates every call |
    | Ticket id | STRING | Mandatory | `10432` | Identifies which ticket to fetch |
    | Timeout | NUMBER | Advanced | `10000` | Rarely changed; sensible default covers it |
    | Fail on non-2xx | BOOLEAN | Advanced (default true) | `true` | Safer default; a 404 should fail the node, not silently return empty |

    **Outputs:**

    | Name | Type | Holds |
    |---|---|---|
    | Ticket id | STRING | Echoed for chaining into update/close calls |
    | Ticket status | STRING | Branchable state (open/closed/pending) |
    | Ticket | JSON | Full raw ticket object — escape hatch for fields not curated above |
    | Curl | STRING | Reproduce the call outside Stream Designer for debugging |

    **Connectors:** Success / Fail

    **Failure cases:**
    - Could not find ticket — Ticket id does not exist — check the id and that the account has access
    - Could not authenticate — Api key was rejected — verify the key is active

    **Assumptions made:** Defaulted Fail on non-2xx to true (safer); no pagination since this fetches one ticket.

    **House-style choices in effect:** defaults, no overrides.

    Reply approve, or tell me what to change.
