/**
 * hcloud-sdk archetype example — THE one node that legitimately reads the
 * helmut.cloud secret store. Copy to `lib/nodes/`, rename the class and
 * enum entries only if you're building a genuinely different secret-store
 * node; most catalogs need at most one of these.
 *
 * Every OTHER node in a catalog accepts credentials as a STRING_PASSWORD
 * input and MUST NOT call the secret store from inside execute() (rule
 * no-secret-store-in-execute, references/secrets-and-auth.md). This node is
 * the documented exception: it exists so those other nodes have something to
 * wire their Api key / Bearer token / Password inputs from —
 *   [ Get space secret ] -> output: Secret value -> [ any node's STRING_PASSWORD input ]
 *
 * Demonstrates: the hcloud-sdk discovery flow (wave.general.getHcloudClient()
 * -> getOrgName() -> getSpaceName() -> client.High5.space.secret.getSecret,
 * verified against node_modules/hcloud-sdk/lib/service/high5/space/secret/
 * index.d.ts and lib/interfaces/high5/space/secret/index.d.ts — getSecret
 * returns Promise<Secret> where Secret.value is string | undefined, not a
 * plain string), pulling org/space from the execution context instead of
 * asking the user for them, three-part-error-message. The Secret value
 * output is typed STRING, not STRING_PASSWORD: StreamNodeSpecificationOutputType
 * (node_modules/hcloud-sdk/lib/interfaces/high5/wave/index.d.ts) has no
 * STRING_PASSWORD member — only input types mask a value in the Stream
 * Designer UI. Masking happens downstream, at whichever STRING_PASSWORD
 * input receives this output.
 */
import Node from "../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";

enum Input {
    SECRET_KEY = "Secret key",
}

enum Output {
    SECRET_VALUE = "Secret value",
}

export default class GetSpaceSecret extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Get space secret",
        description: "Gets details of a specific secret from the space secret store",
        category: "Secrets",
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
                name: Input.SECRET_KEY,
                description: "Enter the key of the secret to get",
                type: StreamNodeSpecificationInputType.STRING,
                example: "ticketing-api-key",
                mandatory: true,
            },
        ],
        outputs: [
            {
                name: Output.SECRET_VALUE,
                description: "Returns the decrypted value of the secret for wiring into a credential input",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "abc123def456",
            },
        ],
    };

    async execute(): Promise<void> {
        const secretKey = this.wave.inputs.getInputValueByInputName(Input.SECRET_KEY) as string;
        const client = this.wave.general.getHcloudClient();
        const orgName = this.wave.general.getOrgName();
        const spaceName = this.wave.general.getSpaceName();

        let value: string | undefined;
        try {
            const secret = await client.High5.space.secret.getSecret(orgName, spaceName, secretKey);
            value = secret.value;
        } catch (err: unknown) {
            const message = (err as Error)?.message ?? "unknown error";
            throw new Error(
                `Could not get secret — sdk request failed: ${message} — verify the Secret key exists in this space`,
            );
        }

        if (value === undefined) {
            throw new Error(
                "Could not get secret — the secret store returned no value for this key — verify the secret was created with a value",
            );
        }

        // Never addNodeLog this value — see references/secrets-and-auth.md.
        this.wave.outputs.setOutput(Output.SECRET_VALUE, value);
    }
}
