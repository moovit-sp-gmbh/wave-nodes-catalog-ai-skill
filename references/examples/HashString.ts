/**
 * Transform archetype example — pure input -> output, no external call.
 * Copy to `lib/nodes/`, rename the class and enum entries.
 *
 * Demonstrates: node-protocol-imports (node:crypto), enum-io-names,
 * spec-version-v3, three-part-error-message, no-class-self-reference (a
 * module-level helper function instead of a static class method — see
 * hashText, unit-tested in HashString.test.ts), category-plural-entity's
 * non-entity-transform exception (singular domain noun "Cryptography"
 * instead of a pluralized entity that doesn't exist here).
 *
 * Does NOT demonstrate: a Curl output (no HTTP call) or cancellation
 * (hashing a short string finishes in milliseconds — see
 * cancellation-and-async.md, "will this run more than ~5 seconds?").
 */
import { createHash } from "node:crypto";
import Node from "../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";

enum Input {
    TEXT = "Text",
}

enum Output {
    HASH = "Hash",
}

// Module-level pure helper — never a static method on the class (see
// no-class-self-reference: esbuild renames a self-referencing class and the
// blueprint's Catalog registry breaks). Exported for HashString.test.ts.
export function hashText(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex");
}

export default class HashString extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Hash string",
        description: "Computes the SHA-256 hash of a string",
        category: "Cryptography",
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
                name: Input.TEXT,
                description: "Enter the text to hash",
                type: StreamNodeSpecificationInputType.STRING,
                example: "helmut",
                mandatory: true,
            },
        ],
        outputs: [
            {
                name: Output.HASH,
                description: "Returns the SHA-256 hash of the input text (hex-encoded)",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "cc04effa2069db88d0b528e3448c4c19580986dd22690a9794b02c8d76544bf7",
            },
        ],
    };

    async execute(): Promise<void> {
        const text = this.wave.inputs.getInputValueByInputName(Input.TEXT) as string;
        if (!text) {
            throw new Error(
                "Could not hash text — Text input was empty — set Text to a non-empty string",
            );
        }
        this.wave.outputs.setOutput(Output.HASH, hashText(text));
    }
}
