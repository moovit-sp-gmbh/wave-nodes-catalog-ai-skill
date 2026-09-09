/**
 * HTTP write archetype example (POST creating a new entity). Copy to
 * `lib/nodes/`, rename the class and enum entries.
 *
 * Demonstrates: mandatory-vs-advanced (Ticket title mandatory; Ticket
 * priority/metadata advanced with defaults), input-entity-prefix (Ticket
 * title/description/priority/metadata all lead with the entity), "no JSON
 * input type" + machine-value-translation (Ticket metadata is STRING_LONG
 * holding a JSON object, parsed/validated at the execute() boundary by a
 * module-level helper — see parseTicketMetadata, unit-tested in
 * CreateTicket.test.ts), curated-output-wireability (Ticket id + Ticket url
 * before the raw entity), three-part-error-message for a write-shaped
 * failure set (400/401/409), curl-on-http-nodes.
 */
import Node from "../Node";
import { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";

enum Input {
    TICKETING_URL = "Ticketing url",
    API_KEY = "Api key",
    TICKET_TITLE = "Ticket title",
    TICKET_DESCRIPTION = "Ticket description",
    TICKET_PRIORITY = "Ticket priority",
    TICKET_METADATA = "Ticket metadata",
}

enum Output {
    TICKET_ID = "Ticket id",
    TICKET_URL = "Ticket url",
    TICKET = "Ticket",
    CURL = "Curl",
}

export interface TicketEntity {
    id: string;
    url: string;
    title: string;
}

// Pure boundary parser for the STRING_LONG "Ticket metadata" input — house
// style has no JSON input type, so a structured optional field is STRING_LONG
// parsed and validated here. Module-level (never a static class method — see
// no-class-self-reference), exported for CreateTicket.test.ts.
export function parseTicketMetadata(raw: string | undefined): Record<string, unknown> | undefined {
    if (raw === undefined || raw.trim().length === 0) return undefined;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(
            'Could not create ticket — Ticket metadata is not valid JSON — enter a JSON object, e.g. {"team":"support"}',
        );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(
            "Could not create ticket — Ticket metadata is not a JSON object — enter a JSON object, not an array or primitive",
        );
    }
    return parsed as Record<string, unknown>;
}

export default class CreateTicket extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Create ticket",
        description: "Creates a new ticket in Ticketing",
        category: "Tickets",
        version: { major: 1, minor: 0, patch: 0, changelog: ["Initial release"] },
        author: { name: "helmut cloud", company: "helmut.cloud", email: "hi@helmut.cloud" },
        inputs: [
            {
                name: Input.TICKETING_URL,
                description: "Enter the base url of the Ticketing instance",
                type: StreamNodeSpecificationInputType.STRING,
                example: "https://helmut.cloud/ticketing",
                mandatory: true,
            },
            {
                name: Input.API_KEY,
                description: "Enter the api key for the Ticketing API",
                type: StreamNodeSpecificationInputType.STRING_PASSWORD,
                example: "abc123def456",
                mandatory: true,
            },
            {
                name: Input.TICKET_TITLE,
                description: "Enter the title for the new ticket",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Printer on 3rd floor is offline",
                mandatory: true,
            },
            {
                name: Input.TICKET_DESCRIPTION,
                description: "Enter the description for the new ticket",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: "The printer near the east elevator shows a paper jam error",
                mandatory: false,
            },
            {
                name: Input.TICKET_PRIORITY,
                description: "Choose the priority for the new ticket",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: { Low: "low", Medium: "medium", High: "high" },
                example: "medium",
                defaultValue: "medium",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.TICKET_METADATA,
                description: "Enter extra ticket fields (JSON object)",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: '{"team":"support"}',
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.TICKET_ID,
                description: "Returns the id of the newly created ticket",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "12345",
            },
            {
                name: Output.TICKET_URL,
                description: "Returns the url of the newly created ticket",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "https://helmut.cloud/ticketing/tickets/12345",
            },
            {
                // Raw entity — escape hatch for fields the curated outputs don't cover.
                name: Output.TICKET,
                description: "Returns the full ticket object from Ticketing",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { id: "12345", url: "https://helmut.cloud/ticketing/tickets/12345", title: "Sample ticket" },
            },
            {
                // Curl is diagnostic, not data — MUST be last (curl-output-last).
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request",
                type: StreamNodeSpecificationOutputType.STRING,
                example: 'curl -X POST -H "Authorization: Bearer <your-token>" https://helmut.cloud/ticketing/api/tickets',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = (this.wave.inputs.getInputValueByInputName(Input.TICKETING_URL) as string).replace(/\/$/, "");
        const apiKey = this.wave.inputs.getInputValueByInputName(Input.API_KEY) as string;
        const title = this.wave.inputs.getInputValueByInputName(Input.TICKET_TITLE) as string;
        const description = this.wave.inputs.getInputValueByInputName(Input.TICKET_DESCRIPTION) as string | undefined;
        const priority = this.wave.inputs.getInputValueByInputName(Input.TICKET_PRIORITY) as string;
        const metadataRaw = this.wave.inputs.getInputValueByInputName(Input.TICKET_METADATA) as string | undefined;
        const metadata = parseTicketMetadata(metadataRaw);

        const requestConfig: AxiosRequestConfig = {
            method: "POST",
            url: `${baseUrl}/api/tickets`,
            headers: { Authorization: `Bearer ${apiKey}` },
            data: this.wave.axiosHelper.removeEmptyFields({
                title,
                description,
                priority,
                ...metadata,
            }),
            timeout: 30_000,
        };

        let ticket: TicketEntity;
        try {
            ticket = await this.wave.axiosHelper.makeRequest(requestConfig);
        } catch (err: unknown) {
            const message = (err as Error)?.message ?? "unknown error";
            if (message.includes("400")) {
                throw new Error(
                    "Could not create ticket — Ticketing rejected the payload (400) — verify Ticket title and Ticket metadata are valid",
                );
            }
            if (message.includes("401")) {
                throw new Error(
                    "Could not authenticate — Ticketing rejected the Api key — verify the Api key is valid and has write access",
                );
            }
            if (message.includes("409")) {
                throw new Error(
                    "Could not create ticket — Ticketing reports a duplicate (409) — a ticket with this title may already exist",
                );
            }
            throw new Error(
                `Could not create ticket — request failed: ${message} — verify the Ticketing url, Api key, and payload`,
            );
        }

        this.wave.outputs.setOutput(Output.TICKET_ID, ticket.id);
        this.wave.outputs.setOutput(Output.TICKET_URL, ticket.url);
        this.wave.outputs.setOutput(Output.TICKET, ticket);

        const safeCurl = this.wave.axiosHelper.convertRequestToCurl({
            ...requestConfig,
            headers: { Authorization: "Bearer <your-token>" },
        });
        this.wave.outputs.setOutput(Output.CURL, safeCurl);
    }
}
