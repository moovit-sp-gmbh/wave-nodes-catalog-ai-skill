/**
 * PARKED — does not compile against the blueprint's installed hcloud-sdk.
 *
 * hcloud-sdk 16.0.0 exports no `StreamNodeSpecificationV4` type and no
 * `if`/dependent-inputs DSL, and wave-engine 2.0.1 only executes spec
 * versions 1–3. This file is kept for reference only — see
 * `references/parked-v4-dependent-inputs.md` for the full explanation and
 * for what to do instead (express the condition in the input description
 * and validate presence inside `execute()`). Do not copy this file into
 * `lib/nodes/` until the engine team ships a release that runs V4 specs.
 *
 * Historical description of what this file demonstrates (V4 spec, the
 * `if: Query` DSL with $eq semantics): the "Bearer token" input shows only
 * when "Auth type" is "bearer"; "Username"/"Password" show only when
 * "Auth type" is "basic".
 */

import Node from "../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV4,
} from "hcloud-sdk/lib/interfaces/high5";

enum Input {
    URL = "Url",
    AUTH_TYPE = "Auth type",
    BEARER_TOKEN = "Bearer token",
    USERNAME = "Username",
    PASSWORD = "Password",
}

enum Output {
    BODY = "Body",
}

export default class SecureGet extends Node {
    specification: StreamNodeSpecificationV4 = {
        specVersion: 4,
        deprecated: false,
        name: "Secure get",
        description: "Performs an HTTP GET with the selected authentication scheme",
        category: "Networking",
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
                name: Input.URL,
                description: "Enter the full URL of the target endpoint",
                type: StreamNodeSpecificationInputType.STRING,
                example: "https://helmut.cloud/",
                mandatory: true,
            },
            {
                name: Input.AUTH_TYPE,
                description: "Choose how to authenticate the request",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: { None: "none", Bearer: "bearer", "Basic auth": "basic" },
                example: "bearer",
                defaultValue: "none",
                mandatory: true,
            },
            // Conditional inputs MUST NOT use `mandatory: true`. The engine's
            // mandatory validator iterates every input unconditionally and does
            // not evaluate the `if` predicate — combining the two would make
            // the node fail on whichever conditional inputs the user couldn't
            // even see. Presence is checked in execute() below when the
            // matching branch is taken. See references/input-type-rules.md
            // (V4 dependent inputs).
            {
                name: Input.BEARER_TOKEN,
                description: "Enter the Bearer Token for the target API",
                type: StreamNodeSpecificationInputType.STRING_PASSWORD,
                example: "eyJhbGciOiJIUzI1NiIs",
                if: { [Input.AUTH_TYPE]: "bearer" },
            },
            {
                name: Input.USERNAME,
                description: "Enter the username for basic auth",
                type: StreamNodeSpecificationInputType.STRING,
                example: "helmut",
                if: { [Input.AUTH_TYPE]: "basic" },
            },
            {
                name: Input.PASSWORD,
                description: "Enter the password for basic auth",
                type: StreamNodeSpecificationInputType.STRING_PASSWORD,
                example: "cloud",
                if: { [Input.AUTH_TYPE]: "basic" },
            },
        ],
        outputs: [
            {
                name: Output.BODY,
                description: "Returns the response body",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { ok: true },
            },
        ],
    };

    async execute(): Promise<void> {
        try {
            const url = this.wave.inputs.getInputValueByInputName(Input.URL) as string;
            const authType = this.wave.inputs.getInputValueByInputName(Input.AUTH_TYPE) as string;

            const headers: Record<string, string> = {};
            if (authType === "bearer") {
                const token = this.wave.inputs.getInputValueByInputName(
                    Input.BEARER_TOKEN,
                ) as string | undefined;
                if (!token) {
                    throw new Error(
                        "Could not authenticate — Bearer token is required when Auth type is 'bearer' — fill in the Bearer token field",
                    );
                }
                headers.Authorization = `Bearer ${token}`;
            } else if (authType === "basic") {
                const user = this.wave.inputs.getInputValueByInputName(Input.USERNAME) as string | undefined;
                const pass = this.wave.inputs.getInputValueByInputName(Input.PASSWORD) as string | undefined;
                if (!user || !pass) {
                    throw new Error(
                        "Could not authenticate — Username and Password are required when Auth type is 'basic' — fill in both fields",
                    );
                }
                headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
            }

            const body = await this.wave.axiosHelper.makeRequest({
                method: "GET",
                url,
                headers,
                timeout: 30_000,
            });

            this.wave.outputs.setOutput(Output.BODY, body);
        } catch (err: unknown) {
            const message = (err as Error)?.message ?? "unknown error";
            throw new Error(
                `Could not GET resource — request failed: ${message} — verify the URL and authentication settings`,
            );
        }
    }
}
