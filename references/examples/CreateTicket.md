::wavedoc
---
title: Create ticket
description: |
  The Create ticket node creates a new ticket in Ticketing. Ticket title is the only required field beyond the connection details; Ticket description is commonly filled in but optional; Ticket priority and Ticket metadata are advanced fields with sensible defaults. Ticket metadata accepts a JSON object of extra fields the API supports beyond the curated ones — it is parsed and validated before the request is sent. Returns the new ticket's id and url as curated fields, the full ticket object, and the equivalent curl command.
inputs:
  - name: Ticketing url
    description: |
      Enter the base url of the Ticketing instance
    type: STRING
    mandatory: true
    example:
      - name: Ticketing url
        value: "https://helmut.cloud/ticketing"
  - name: Api key
    description: |
      Enter the api key for the Ticketing API. For production credentials, wire this input from an upstream Get space secret node; for testing, a literal value also works
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: Api key
        value: "abc123def456"
  - name: Ticket title
    description: |
      Enter the title for the new ticket
    type: STRING
    mandatory: true
    example:
      - name: Ticket title
        value: "Printer on 3rd floor is offline"
  - name: Ticket description
    description: |
      Enter the description for the new ticket
    type: STRING_LONG
    mandatory: false
    example:
      - name: Ticket description
        value: "The printer near the east elevator shows a paper jam error"
  - name: Ticket priority
    description: |
      Choose the priority for the new ticket
    type: STRING_SELECT
    mandatory: false
    advanced: true
    options:
      - name: Low
        description: |
          Low priority — no immediate response expected
      - name: Medium
        description: |
          Standard priority
        default: true
      - name: High
        description: |
          Needs prompt attention
    example:
      - name: Ticket priority
        value: medium
  - name: Ticket metadata
    description: |
      Enter extra ticket fields (JSON object). Invalid JSON, or a JSON value that is not an object, fails the node before any request is sent
    type: STRING_LONG
    mandatory: false
    advanced: true
    example:
      - name: Ticket metadata
        value: '{"team":"support"}'
outputs:
  - name: Ticket id
    description: |
      Returns the id of the newly created ticket
    type: STRING
    example:
      - name: Ticket id
        value: "12345"
  - name: Ticket url
    description: |
      Returns the url of the newly created ticket
    type: STRING
    example:
      - name: Ticket url
        value: "https://helmut.cloud/ticketing/tickets/12345"
  - name: Ticket
    description: |
      Returns the full ticket object from Ticketing (raw response — escape hatch for fields not surfaced by curated outputs)
    type: OBJECT
    example:
      - name: Ticket
        value: |
          {
            "id": "12345",
            "url": "https://helmut.cloud/ticketing/tickets/12345",
            "title": "Sample ticket"
          }
  - name: Curl
    description: |
      Returns the curl command equivalent of the request, with a placeholder in place of the api key
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X POST \
          -H "Authorization: Bearer <your-token>" \
          https://helmut.cloud/ticketing/api/tickets
connectors:
  - name: Success
    description: |
      Triggered when the ticket is created successfully
  - name: Fail
    description: |
      Triggered when the ticket cannot be created
    causes:
      - name: Invalid Input
        description: |
          If Ticket metadata is not valid JSON, or is valid JSON that isn't an object
      - name: Invalid Configuration
        description: |
          If Ticketing rejects the payload as malformed (400) — verify Ticket title and Ticket metadata
      - name: Permission Denied
        description: |
          If the provided Api key is invalid or lacks write access
      - name: Duplicate
        description: |
          If Ticketing reports a conflicting ticket already exists (409)
      - name: API Error
        description: |
          If Ticketing returned an unexpected error response
---
::
