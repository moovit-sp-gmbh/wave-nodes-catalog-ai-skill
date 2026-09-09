::wavedoc
---
title: Get space secret
description: |
  The Get space secret node gets details of a specific secret from the space secret store. It is the one node in a catalog that legitimately reads the secret store directly — every other node accepts credentials through its own STRING_PASSWORD input instead. Wire this node's Secret value output into another node's Api key, Bearer token, or Password input to supply that credential without typing it as a literal.
inputs:
  - name: Secret key
    description: |
      Enter the key of the secret to get
    type: STRING
    mandatory: true
    example:
      - name: Secret key
        value: "ticketing-api-key"
outputs:
  - name: Secret value
    description: |
      Returns the decrypted value of the secret for wiring into a credential input
    type: STRING
    example:
      - name: Secret value
        value: "abc123def456"
connectors:
  - name: Success
    description: |
      Triggered when the secret value is retrieved successfully
  - name: Fail
    description: |
      Triggered when the secret cannot be retrieved
    causes:
      - name: Not Found
        description: |
          If no secret with the provided Secret key exists in this space
      - name: Invalid Configuration
        description: |
          If the secret exists but was created without a value
      - name: API Error
        description: |
          If the helmut.cloud platform returned an unexpected error response
---
::
