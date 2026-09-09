::wavedoc
---
title: List tickets
description: |
  The List tickets node lists tickets in Ticketing. Search query filters the results by subject; Max results caps how many tickets come back in this one-shot call (the node does not paginate — see Max results below). Returns a count and the id of every matching ticket as curated fields, the full array, and the equivalent curl command.
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
  - name: Search query
    description: |
      Enter a search query to filter tickets by subject
    type: STRING
    mandatory: false
    example:
      - name: Search query
        value: "printer"
  - name: Max results
    description: |
      Enter the maximum number of tickets to return
    type: INT
    mandatory: false
    advanced: true
    example:
      - name: Max results
        value: 25
outputs:
  - name: Total count
    description: |
      Returns the number of tickets in this response for empty-result branching
    type: INT
    example:
      - name: Total count
        value: 2
  - name: Ticket ids
    description: |
      Returns the id of every ticket in this response
    type: STRING_LIST
    example:
      - name: Ticket ids
        value: "12345, 12346"
  - name: Tickets
    description: |
      Returns the full array of tickets from the API response (raw response — escape hatch for fields not surfaced by curated outputs)
    type: OBJECT
    example:
      - name: Tickets
        value: |
          [
            { "id": "12345", "status": "open", "subject": "Sample ticket" }
          ]
  - name: Curl
    description: |
      Returns the curl command equivalent of the request, with a placeholder in place of the api key
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X GET \
          -H "Authorization: Bearer <your-token>" \
          "https://helmut.cloud/ticketing/api/tickets?per_page=25"
connectors:
  - name: Success
    description: |
      Triggered when the tickets are listed successfully
  - name: Fail
    description: |
      Triggered when the tickets cannot be listed
    causes:
      - name: Permission Denied
        description: |
          If the provided Api key is invalid or lacks read access
      - name: API Error
        description: |
          If Ticketing returned an unexpected error response
---
::
