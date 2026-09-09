::wavedoc
---
title: Get ticket
description: |
  The Get ticket node gets details of a specific ticket from Ticketing. The Api key input accepts the credential value at runtime — typically wired from a Get space secret node, but any source that supplies a string works. Returns the ticket's id and status as curated fields, the full ticket object, and the equivalent curl command for the request.
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
  - name: Ticket id
    description: |
      Enter the id of the ticket to get
    type: STRING
    mandatory: true
    example:
      - name: Ticket id
        value: "12345"
outputs:
  - name: Ticket id
    description: |
      Returns the id of the retrieved ticket
    type: STRING
    example:
      - name: Ticket id
        value: "12345"
  - name: Ticket status
    description: |
      Returns the status of the retrieved ticket for branching
    type: STRING
    example:
      - name: Ticket status
        value: "open"
  - name: Ticket
    description: |
      Returns the full ticket object from Ticketing (raw response — escape hatch for fields not surfaced by curated outputs)
    type: OBJECT
    example:
      - name: Ticket
        value: |
          {
            "id": "12345",
            "status": "open",
            "subject": "Sample ticket"
          }
  - name: Curl
    description: |
      Returns the curl command equivalent of the request, with a placeholder in place of the api key
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X GET \
          -H "Authorization: Bearer <your-token>" \
          https://helmut.cloud/ticketing/api/tickets/12345
connectors:
  - name: Success
    description: |
      Triggered when the ticket is fetched successfully
  - name: Fail
    description: |
      Triggered when the ticket cannot be fetched
    causes:
      - name: Not Found
        description: |
          If no ticket with the provided Ticket id exists in this Ticketing instance
      - name: Permission Denied
        description: |
          If the provided Api key is invalid or lacks read access
      - name: Timeout
        description: |
          If the request to Ticketing exceeded the 30 second timeout without a response
      - name: API Error
        description: |
          If Ticketing returned an unexpected error response
---
::
