/**
 * File/folder archetype example. Streams a download from a URL into a target
 * folder via axios. Copy to `lib/nodes/`, rename the class and enum entries.
 *
 * Demonstrates: file-conflict-handling (Duplicate file option is a
 * STRING_SELECT backed by the engine's own DuplicateFileOption enum —
 * Fail/Skip/Overwrite/Rename existing/Increment name, verified against
 * node_modules/wave-engine/models/DuplicateFileOptionEnum.d.ts), progress
 * reporting via wave.logger as bytes stream in, an AbortController tied to
 * cooperative cancellation (cancellation-and-async.md), onCleanup removing a
 * partial download if the node is canceled or the write fails, node-
 * protocol-imports (node:fs, node:fs/promises, node:path).
 *
 * STRING_SELECT option KEYS are sentence case (Stream Designer labels); the
 * VALUES are the engine's own DuplicateFileOption string literals, which are
 * intentionally not checked by sentence-case-names (see that rule's own
 * comment) — "Rename Existing" is the engine's wire value, not a naming
 * mistake here.
 */
import { createWriteStream } from "node:fs";
import { access, stat, unlink } from "node:fs/promises";
import path from "node:path";
import Node from "../Node";
import axios from "axios";
import { DuplicateFileOption } from "wave-engine/models/DuplicateFileOptionEnum";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";

enum Input {
    FILE_URL = "File url",
    TARGET_FOLDER = "Target folder",
    FILE_NAME = "File name",
    DUPLICATE_FILE_OPTION = "Duplicate file option",
}

enum Output {
    FILE_PATH = "File path",
    FILE_SIZE = "File size",
}

export default class DownloadFile extends Node {
    // The blueprint's Node base class doesn't declare onCleanup — a node that
    // assigns one must declare the field itself.
    public onCleanup?: () => Promise<void>;

    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Download file",
        description: "Downloads a file from a url into a target folder",
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
                name: Input.FILE_URL,
                description: "Enter the url of the file to download",
                type: StreamNodeSpecificationInputType.STRING,
                example: "https://helmut.cloud/logo.png",
                mandatory: true,
            },
            {
                name: Input.TARGET_FOLDER,
                description: "Enter the absolute path of the folder to save the file in",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/Users/helmut/cloud",
                mandatory: true,
            },
            {
                name: Input.FILE_NAME,
                description: "Enter the file name to save the download as",
                type: StreamNodeSpecificationInputType.STRING,
                example: "helmut.png",
                mandatory: true,
            },
            {
                name: Input.DUPLICATE_FILE_OPTION,
                description: "Choose how to handle an existing file with the same name",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: {
                    Fail: DuplicateFileOption.FAIL,
                    Skip: DuplicateFileOption.SKIP,
                    Overwrite: DuplicateFileOption.OVERWRITE,
                    "Rename existing": DuplicateFileOption.RENAME_EXISTING,
                    "Increment name": DuplicateFileOption.INCREMENT_NAME,
                },
                example: DuplicateFileOption.FAIL,
                defaultValue: DuplicateFileOption.FAIL,
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.FILE_PATH,
                description: "Returns the final path of the downloaded file",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "/Users/helmut/cloud/helmut.png",
            },
            {
                name: Output.FILE_SIZE,
                description: "Returns the size of the downloaded file in bytes",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 20480,
            },
        ],
    };

    async execute(): Promise<void> {
        const fileUrl = this.wave.inputs.getInputValueByInputName(Input.FILE_URL) as string;
        const targetFolder = this.wave.inputs.getInputValueByInputName(Input.TARGET_FOLDER) as string;
        const fileName = this.wave.inputs.getInputValueByInputName(Input.FILE_NAME) as string;
        const duplicateOption = this.wave.inputs.getInputValueByInputName(
            Input.DUPLICATE_FILE_OPTION,
        ) as DuplicateFileOption;

        const requestedPath = path.join(targetFolder, fileName);

        // Honor Skip explicitly: createFile's SKIP branch would return the
        // existing path without telling us whether it already existed, and we
        // must not overwrite it by streaming a download into it below.
        if (duplicateOption === DuplicateFileOption.SKIP) {
            try {
                await access(requestedPath);
                const stats = await stat(requestedPath);
                this.wave.outputs.setOutput(Output.FILE_PATH, requestedPath);
                this.wave.outputs.setOutput(Output.FILE_SIZE, stats.size);
                return;
            } catch {
                // File does not exist yet — fall through to the normal download.
            }
        }

        const finalPath = await this.wave.fileAndFolderHelper.createFile(requestedPath, duplicateOption);

        let cancelInterval: NodeJS.Timeout | undefined;
        const controller = new AbortController();
        let bytesWritten = 0;
        let downloadStarted = false;

        // Resource cleanup that outlives this node's success/fail decision.
        this.onCleanup = async () => {
            if (!downloadStarted) return;
            try {
                await unlink(finalPath);
            } catch {
                // Already removed, or the download completed successfully.
            }
        };

        try {
            const response = await axios({
                method: "GET",
                url: fileUrl,
                responseType: "stream",
                signal: controller.signal,
            });
            const totalBytes = Number(response.headers["content-length"] ?? 0);
            downloadStarted = true;

            await new Promise<void>((resolve, reject) => {
                const writeStream = createWriteStream(finalPath);

                cancelInterval = setInterval(() => {
                    if (this.wave.general.isCanceled()) controller.abort();
                }, 1_000);

                response.data.on("data", (chunk: Buffer) => {
                    bytesWritten += chunk.length;
                    if (totalBytes > 0) {
                        this.wave.logger.updateProgressAndMessage(
                            Math.floor((bytesWritten / totalBytes) * 100),
                            `Downloaded ${bytesWritten} of ${totalBytes} bytes`,
                        );
                    }
                });
                response.data.on("error", reject);
                writeStream.on("error", reject);
                writeStream.on("finish", resolve);
                response.data.pipe(writeStream);
            });
        } catch (err: unknown) {
            if (this.wave.general.isCanceled()) {
                throw new Error("Download canceled — user stopped the stream — no action needed");
            }
            const message = (err as Error)?.message ?? "unknown error";
            throw new Error(
                `Could not download file — request failed: ${message} — verify the File url and network connectivity`,
            );
        } finally {
            if (cancelInterval) clearInterval(cancelInterval);
        }

        this.wave.outputs.setOutput(Output.FILE_PATH, finalPath);
        this.wave.outputs.setOutput(Output.FILE_SIZE, bytesWritten);
    }
}
