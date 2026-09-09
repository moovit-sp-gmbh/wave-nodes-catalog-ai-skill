::wavedoc
---
title: Get kubernetes pod
description: |
  The Get kubernetes pod node retrieves a pod by name via kubectl and returns its json description. Pod name and Namespace are validated against the Kubernetes naming rules before kubectl is invoked; anything that doesn't match is rejected without running a command. The resolved invocation is also returned on the Command output for debugging.
inputs:
  - name: Pod name
    description: |
      Enter the name of the pod to retrieve (RFC 1123 DNS label)
    type: STRING
    mandatory: true
    example:
      - name: Pod name
        value: "nginx-7c5bb6d9f5-x8q2j"
  - name: Namespace
    description: |
      Enter the namespace the pod lives in
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Namespace
        value: "default"
  - name: Kubeconfig path
    description: |
      Enter the absolute path to a kubeconfig file (defaults to $KUBECONFIG or ~/.kube/config)
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Unix
        value: "/home/runner/.kube/config"
  - name: Timeout
    description: |
      Enter the maximum time to wait for kubectl (in seconds)
    type: INT
    mandatory: false
    advanced: true
    example:
      - name: Timeout
        value: 30
outputs:
  - name: Pod
    description: |
      Returns the pod description as parsed json
    type: OBJECT
    example:
      - name: Pod
        value: |
          {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": { "name": "nginx-7c5bb6d9f5-x8q2j" }
          }
  - name: Exit code
    description: |
      Returns the kubectl process exit code
    type: INT
    example:
      - name: Exit code
        value: 0
  - name: Command
    description: |
      Returns the resolved kubectl invocation for debugging
    type: STRING
    example:
      - name: Command
        value: "/usr/local/bin/kubectl get pod nginx-7c5bb6d9f5-x8q2j -n default -o json"
connectors:
  - name: Success
    description: |
      Triggered when kubectl returns the pod description successfully
  - name: Fail
    description: |
      Triggered when the pod cannot be retrieved
    causes:
      - name: Invalid Input
        description: |
          If Pod name, Namespace, or Kubeconfig path fails validation before kubectl is invoked
      - name: Timeout
        description: |
          If kubectl does not finish within the configured Timeout
      - name: Not Found
        description: |
          If kubectl exits non-zero because the pod or namespace does not exist
      - name: API Error
        description: |
          If kubectl exits non-zero for any other reason, or its output exceeds the 10 MB buffer limit
---
::
