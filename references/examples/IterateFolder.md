::wavedoc
---
title: Iterate folder
description: |
  The Iterate folder node iterates over files in a folder, emitting each file's path via the File connector as it iterates. The wired downstream substream completes before the next file is processed. Once every file has been emitted, the node returns the total file count and the Success connector fires.
inputs:
  - name: Folder path
    description: |
      Enter the absolute path of the folder to iterate
    type: STRING
    mandatory: true
    example:
      - name: Windows
        value: "C:\\helmut\\cloud"
      - name: Unix
        value: "/Users/helmut/cloud"
outputs:
  - name: Current file path
    description: |
      Returns the current file path on each iteration of the File connector
    type: STRING
    example:
      - name: Windows
        value: "C:\\helmut\\cloud\\helmut.txt"
      - name: Unix
        value: "/Users/helmut/cloud/helmut.txt"
  - name: Total files
    description: |
      Returns the total number of files emitted once iteration completes
    type: INT
    example:
      - name: Total files
        value: 12
connectors:
  - name: Success
    description: |
      Triggered once every file has been emitted and each substream has completed
  - name: Fail
    description: |
      Triggered when the folder cannot be iterated
    causes:
      - name: Asset Not Found
        description: |
          If Folder path does not exist or is not readable
      - name: Invalid Configuration
        description: |
          If the stream was stopped while iteration was still in progress
  - name: File
    description: |
      Fires once per file with the path on the Current file path output. The wired substream completes before the next iteration begins
---
::
