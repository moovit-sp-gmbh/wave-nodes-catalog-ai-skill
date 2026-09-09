::wavedoc
---
title: Download file
description: |
  The Download file node downloads a file from a url into a target folder. Duplicate file option decides what happens when a file with the same name already exists at the destination. Progress is reported as bytes stream in, and the download can be canceled mid-transfer — any partially written file is removed automatically.
inputs:
  - name: File url
    description: |
      Enter the url of the file to download
    type: STRING
    mandatory: true
    example:
      - name: File url
        value: "https://helmut.cloud/logo.png"
  - name: Target folder
    description: |
      Enter the absolute path of the folder to save the file in
    type: STRING
    mandatory: true
    example:
      - name: Windows
        value: "C:\\helmut\\cloud"
      - name: Unix
        value: "/Users/helmut/cloud"
  - name: File name
    description: |
      Enter the file name to save the download as
    type: STRING
    mandatory: true
    example:
      - name: File name
        value: "helmut.png"
  - name: Duplicate file option
    description: |
      Choose how to handle an existing file with the same name
    type: STRING_SELECT
    mandatory: false
    advanced: true
    options:
      - name: Fail
        description: |
          Stops the node if a file with the same name already exists
        default: true
      - name: Skip
        description: |
          Keeps the existing file and returns its path and size without downloading
      - name: Overwrite
        description: |
          Removes the existing file before downloading the new one
      - name: Rename existing
        description: |
          Renames the existing file, appending a numeric suffix, before downloading the new one
      - name: Increment name
        description: |
          Appends an incrementing numeric suffix to the new file's name until it is unique
    example:
      - name: Duplicate file option
        value: Fail
outputs:
  - name: File path
    description: |
      Returns the final path of the downloaded file
    type: STRING
    example:
      - name: Windows
        value: "C:\\helmut\\cloud\\helmut.png"
      - name: Unix
        value: "/Users/helmut/cloud/helmut.png"
  - name: File size
    description: |
      Returns the size of the downloaded file in bytes
    type: INT
    example:
      - name: File size
        value: 20480
connectors:
  - name: Success
    description: |
      Triggered when the file is downloaded (or skipped) successfully
  - name: Fail
    description: |
      Triggered when the file cannot be downloaded
    causes:
      - name: Network Issue
        description: |
          If the helmut.cloud agent cannot reach File url or the connection drops mid-transfer
      - name: Duplicate
        description: |
          If Duplicate file option is set to Fail and a file with the same name already exists
      - name: Permissions
        description: |
          If the agent cannot write to Target folder
---
::
