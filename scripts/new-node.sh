#!/usr/bin/env bash
# Scaffolds a new wave node into lib/nodes/<Name>.ts plus a placeholder test in tests/nodes/<Name>.test.ts.
# Every placeholder it writes starts with "TODO:" so scripts/verify.mjs (scaffold check) can detect
# leftovers without colliding with real names — keep the marker list there in sync with this file.
# Run from the catalog root:
#   bash .agents/skills/create-high5-nodes/scripts/new-node.sh "MyNode" "Category Name"

set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: new-node.sh <ClassName> [Category] [Subfolder]

  <ClassName>   PascalCase class name (also the file name and Stream Designer key).
  [Category]    Optional. Pluralized entity name, max 2 words. Defaults to "Custom".
  [Subfolder]   Optional. Folder under lib/nodes/ for catalogs that group nodes per
                category (e.g. high5Events). Omit for the flat blueprint layout.
                Match whatever the catalog already uses; never introduce subfolders
                into a flat catalog.

Examples:
  new-node.sh CreateTicket Tickets
  new-node.sh CreateEvent Events high5Events

Scaffolding several nodes in one go: call this script once per node — never loop
over a single unquoted string, which splits on spaces and produces a file named
after a stray word (e.g. "ListTeams Teams" -> lib/nodes/"ListTeams Teams.ts").
Use separate invocations:

  bash new-node.sh ListTeams Teams
  bash new-node.sh CreateTask Tasks

or a loop over quoted, positional-split specs:

  for spec in "ListTeams Teams" "CreateTask Tasks"; do
      set -- $spec
      bash new-node.sh "$1" "$2"
  done
USAGE
}

case "${1:-}" in
    -h|--help) usage; exit 0 ;;
esac
if [ $# -lt 1 ]; then
    usage >&2
    exit 1
fi

CLASS_NAME="$1"
CATEGORY="${2:-Custom}"
SUBFOLDER="${3:-}"

case "$CLASS_NAME" in
    *[[:space:]]*)
        echo "Refusing: ClassName \"$CLASS_NAME\" contains whitespace — pass one class name per invocation (see usage above)." >&2
        exit 1
        ;;
    -*)
        echo "Refusing: ClassName \"$CLASS_NAME\" looks like a flag — the only flag is --help." >&2
        exit 1
        ;;
esac
SUBFOLDER="${SUBFOLDER#lib/nodes/}"; SUBFOLDER="${SUBFOLDER%/}"

# Import prefix from the node file back to lib/: one "../" per subfolder level.
if [ -n "$SUBFOLDER" ]; then
    NODE_DIR="lib/nodes/${SUBFOLDER}"
    DEPTH=$(( $(echo "$SUBFOLDER" | tr -cd '/' | wc -c) + 2 ))
else
    NODE_DIR="lib/nodes"
    DEPTH=1
fi
UP=""; for _ in $(seq 1 "$DEPTH"); do UP="../${UP}"; done

# Derive a human-readable display name from PascalCase: "CreateTicket" -> "Create Ticket"
DISPLAY_NAME=$(echo "$CLASS_NAME" | sed -E 's/([a-z0-9])([A-Z])/\1 \2/g')

NODE_PATH="${NODE_DIR}/${CLASS_NAME}.ts"
DOC_PATH="${NODE_DIR}/${CLASS_NAME}.md"
TEST_PATH="tests/nodes/${CLASS_NAME}.test.ts"

if [ -e "$NODE_PATH" ] || [ -e "$DOC_PATH" ] || [ -e "$TEST_PATH" ]; then
    echo "Refusing to overwrite existing files:"
    [ -e "$NODE_PATH" ] && echo "  - $NODE_PATH"
    [ -e "$DOC_PATH" ] && echo "  - $DOC_PATH"
    [ -e "$TEST_PATH" ] && echo "  - $TEST_PATH"
    exit 1
fi

mkdir -p "$(dirname "$NODE_PATH")" "$(dirname "$TEST_PATH")"

cat >"$NODE_PATH" <<NODE
import Node from "${UP}Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";

enum Input {
    EXAMPLE = "TODO: input name",
}

enum Output {
    RESULT = "TODO: output name",
}

export default class ${CLASS_NAME} extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "${DISPLAY_NAME}",
        description: "TODO: one short sentence about what this node does",
        category: "${CATEGORY}",
        version: {
            major: 1,
            minor: 0,
            patch: 0,
            changelog: ["Initial release"],
        },
        author: {
            name: "helmut cloud",
            company: "helmut.cloud",
            email: "hi@helmut.cloud",
        },
        inputs: [
            {
                name: Input.EXAMPLE,
                description: "TODO: what to put in this input",
                type: StreamNodeSpecificationInputType.STRING,
                example: "helmut",
                mandatory: true,
            },
        ],
        outputs: [
            {
                name: Output.RESULT,
                description: "TODO: what this output contains",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "helmut.cloud",
            },
        ],
    };

    async execute(): Promise<void> {
        // The engine emits node duration as \`node.<uuid>.info.runTime\` automatically —
        // don't declare a \`Run time\` output, don't time the run with performance.now().
        const value = this.wave.inputs.getInputValueByInputName(Input.EXAMPLE) as string;
        if (!value) {
            throw new Error(
                "Could not run ${DISPLAY_NAME} — TODO: input name was empty — set the TODO: input name field",
            );
        }
        // TODO: implement the action
        this.wave.outputs.setOutput(Output.RESULT, value);
    }
}
NODE

cat >"$DOC_PATH" <<DOC
::wavedoc
---
title: ${DISPLAY_NAME}
description: |
  The ${DISPLAY_NAME} node TODO: one or more sentences describing what the node accomplishes.
inputs:
  - name: "TODO: input name"
    description: |
      TODO: explain what to put in this input.
    type: STRING
    mandatory: true
    example:
      - name: "TODO: input name"
        value: "helmut"
outputs:
  - name: "TODO: output name"
    description: |
      TODO: what this output contains.
    type: STRING
    example:
      - name: "TODO: output name"
        value: "helmut.cloud"
  - name: Run time
    description: |
      Returns the total execution time of the node in milliseconds.
    type: NUMBER
    example:
      - name: Run time
        value: 1
connectors:
  - name: Success
    description: |
      Triggered when the node completes successfully.
  - name: Fail
    description: |
      Triggered when the node cannot complete its operation.
    causes:
      - name: Invalid Configuration
        description: |
          If the node is misconfigured or lacks necessary parameters.
---
::
DOC

cat >"$TEST_PATH" <<TEST
import ${CLASS_NAME} from "../../${NODE_DIR}/${CLASS_NAME}";

describe("${CLASS_NAME}", () => {
    it("TODO: replace with a real behavior test", () => {
        // Test a pure helper method on the class. Don't try to test execute() directly —
        // it depends on this.wave which is injected at runtime by the engine.
        expect(typeof ${CLASS_NAME}.prototype.execute).toBe("function");
    });
});
TEST

cat <<DONE

  Created:
    $NODE_PATH
    $DOC_PATH
    $TEST_PATH

  Two follow-ups to complete the registration:

  1) Add to index.ts:
       import ${CLASS_NAME} from "./${NODE_DIR}/${CLASS_NAME}";
     ...and add ${CLASS_NAME} to the Catalog(...) varargs at the bottom of the file.

  2) Add an entry to changelog.json at the top of the array describing this addition.
     See changelog-howTo.md for the rules.

  Then iterate: edit the .ts file, sync the .md as you change inputs/outputs/connectors,
  run \`npm test\`, \`npx eslint ${NODE_DIR}/${CLASS_NAME}.ts\`, and \`npm run spec -- ${CLASS_NAME}\`.

DONE
