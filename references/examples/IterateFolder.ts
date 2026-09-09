/**
 * Iteration-with-additional-connector archetype example. Lists files in a
 * folder with node:fs/promises readdir and emits each one via the File
 * additional connector. Copy to `lib/nodes/`, rename the class and enum
 * entries.
 *
 * Demonstrates: additional-connectors-mid-execution-only (File fires once
 * per file, never for a terminal outcome — a read failure throws to Fail
 * instead), the paired-output ordering rule (Current file path is hydrated
 * BEFORE each executeAdditionalConnector await — see additional-
 * connectors.md), always awaiting executeAdditionalConnector (no fire-and-
 * forget), cooperative cancellation checked between iterations, progress
 * reported via wave.logger.updateProgressAndMessage, Total files set only
 * after the loop completes, node-protocol-imports.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import Node from "../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";

enum Input {
    FOLDER_PATH = "Folder path",
}

enum Output {
    CURRENT_FILE_PATH = "Current file path",
    TOTAL_FILES = "Total files",
}

export default class IterateFolder extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Iterate folder",
        description: "Iterates over files in a folder, emitting each via the File connector",
        category: "Files",
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
                name: Input.FOLDER_PATH,
                description: "Enter the absolute path of the folder to iterate",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/Users/helmut/cloud",
                mandatory: true,
            },
        ],
        outputs: [
            {
                name: Output.CURRENT_FILE_PATH,
                description: "Returns the current file path on each iteration of the File connector",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "/Users/helmut/cloud/helmut.txt",
            },
            {
                name: Output.TOTAL_FILES,
                description: "Returns the total number of files emitted once iteration completes",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 12,
            },
        ],
        additionalConnectors: [
            {
                name: "File",
                description:
                    "Fires once per file with the path on the 'Current file path' output — the wired substream completes before the next iteration begins",
            },
        ],
    };

    async execute(): Promise<void> {
        const folderPath = this.wave.inputs.getInputValueByInputName(Input.FOLDER_PATH) as string;

        let names: string[];
        try {
            names = await readdir(folderPath);
        } catch (err: unknown) {
            const message = (err as Error)?.message ?? "unknown error";
            throw new Error(
                `Could not iterate folder — read failed: ${message} — verify Folder path exists and is readable`,
            );
        }

        const filePaths = names.map((name) => path.join(folderPath, name));

        for (let i = 0; i < filePaths.length; i++) {
            // Cooperative cancellation — cheap to check between short iterations.
            if (this.wave.general.isCanceled()) {
                throw new Error("Iteration canceled — user stopped the stream — no action needed");
            }
            // 1. Hydrate the paired output BEFORE firing the connector.
            this.wave.outputs.setOutput(Output.CURRENT_FILE_PATH, filePaths[i]);
            // 2. Fire the connector — the substream reads outputs at its start. Always await.
            await this.wave.outputs.executeAdditionalConnector("File");
            // 3. Report progress on the standard logger.
            this.wave.logger.updateProgressAndMessage(
                Math.floor(((i + 1) / filePaths.length) * 100),
                `Processed ${i + 1} of ${filePaths.length}`,
            );
        }

        // Success fires after every per-item substream has completed.
        this.wave.outputs.setOutput(Output.TOTAL_FILES, filePaths.length);
    }
}
