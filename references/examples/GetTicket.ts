/**
 * HTTP read one archetype example (GET a single entity). Copy to
 * `lib/nodes/`, rename the class and enum entries.
 *
 * The wrapped product is a fictional "Jitbit-like" ticketing system, named
 * generically as "Ticketing" — see naming-and-style.md for the
 * <Product> url / credential naming templates this follows.
 *
 * Demonstrates: credential-and-url-input-naming (Ticketing url + Api key),
 * credentials-string-password, curated-output-wireability (Ticket id is the
 * primary identifier, Ticket status is a branchable field), outputs-curated-
 * raw-curl / curl-on-http-nodes (raw Ticket JSON, then Curl last with the
 * Api key redacted via convertRequestToCurl on a redacted request config),
 * three-part-error-message mapping distinct causes (401, 404, timeout),
 * node-description-template (Get template).
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
    TICKET_ID = "Ticket id",
}

enum Output {
    TICKET_ID = "Ticket id",
    TICKET_STATUS = "Ticket status",
    TICKET = "Ticket",
    CURL = "Curl",
}

interface TicketEntity {
    id: string;
    status: string;
    subject: string;
}

export default class GetTicket extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Get ticket",
        description: "Gets details of a specific ticket from Ticketing",
        category: "Tickets",
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
                name: Input.TICKET_ID,
                description: "Enter the id of the ticket to get",
                type: StreamNodeSpecificationInputType.STRING,
                example: "12345",
                mandatory: true,
            },
        ],
        outputs: [
            {
                name: Output.TICKET_ID,
                description: "Returns the id of the retrieved ticket",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "12345",
            },
            {
                name: Output.TICKET_STATUS,
                description: "Returns the status of the retrieved ticket for branching",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "open",
            },
            {
                // Raw entity — escape hatch for fields the curated outputs don't cover.
                name: Output.TICKET,
                description: "Returns the full ticket object from Ticketing",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { id: "12345", status: "open", subject: "Sample ticket" },
            },
            {
                // Curl is diagnostic, not data — MUST be last (curl-output-last).
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request",
                type: StreamNodeSpecificationOutputType.STRING,
                example:
                    'curl -X GET -H "Authorization: Bearer <your-token>" https://helmut.cloud/ticketing/api/tickets/12345',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = (this.wave.inputs.getInputValueByInputName(Input.TICKETING_URL) as string).replace(
            /\/$/,
            "",
        );
        const apiKey = this.wave.inputs.getInputValueByInputName(Input.API_KEY) as string;
        const ticketId = this.wave.inputs.getInputValueByInputName(Input.TICKET_ID) as string;
        // NOTE: never log apiKey — STRING_PASSWORD is not auto-redacted by the engine.

        const requestConfig: AxiosRequestConfig = {
            method: "GET",
            url: `${baseUrl}/api/tickets/${ticketId}`,
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 30_000,
        };

        let ticket: TicketEntity;
        try {
            ticket = await this.wave.axiosHelper.makeRequest(requestConfig);
        } catch (err: unknown) {
            const message = (err as Error)?.message ?? "unknown error";
            if (message.includes("404")) {
                throw new Error(
                    "Could not get ticket — Ticketing returned 404 — verify the Ticket id exists in this instance",
                );
            }
            if (message.includes("401")) {
                throw new Error(
                    "Could not authenticate — Ticketing rejected the Api key — verify the Api key is valid and has read access",
                );
            }
            if (message.toLowerCase().includes("timeout")) {
                throw new Error(
                    "Could not get ticket — request timed out after 30 seconds — verify the Ticketing url and network connectivity",
                );
            }
            throw new Error(
                `Could not get ticket — request failed: ${message} — verify the Ticketing url, Api key, and Ticket id`,
            );
        }

        this.wave.outputs.setOutput(Output.TICKET_ID, ticket.id);
        this.wave.outputs.setOutput(Output.TICKET_STATUS, ticket.status);
        this.wave.outputs.setOutput(Output.TICKET, ticket);

        const safeCurl = this.wave.axiosHelper.convertRequestToCurl({
            ...requestConfig,
            headers: { Authorization: "Bearer <your-token>" },
        });
        this.wave.outputs.setOutput(Output.CURL, safeCurl);
    }
}
