::wavedoc
---
title: Hash string
description: |
  The Hash string node computes the SHA-256 hash of a string. It runs entirely in-process (no external call), so it completes in milliseconds regardless of input length.
inputs:
  - name: Text
    description: |
      Enter the text to hash
    type: STRING
    mandatory: true
    example:
      - name: Text
        value: "helmut"
outputs:
  - name: Hash
    description: |
      Returns the SHA-256 hash of the input text (hex-encoded)
    type: STRING
    example:
      - name: Hash
        value: "cc04effa2069db88d0b528e3448c4c19580986dd22690a9794b02c8d76544bf7"
connectors:
  - name: Success
    description: |
      Triggered when the text is hashed successfully
  - name: Fail
    description: |
      Triggered when the text cannot be hashed
    causes:
      - name: Invalid Input
        description: |
          If the Text input is empty
---
::
