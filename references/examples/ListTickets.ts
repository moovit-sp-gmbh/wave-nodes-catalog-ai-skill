/**
 * List/search archetype example (GET a collection). Copy to `lib/nodes/`,
 * rename the class and enum entries.
 *
 * Demonstrates: search-and-pagination-inputs (a visible Search query filter;
 * Max results is an advanced size cap instead of a raw Page/Offset/Cursor
 * input a one-shot node can't use), curated-output-wireability (Total count
 * for empty-result branching, Ticket ids as the primary id list before the
 * raw array), output-type-priority (STRING_LIST over JSON for the id array),
 * outputs-curated-raw-curl / curl-on-http-nodes, no-class-self-reference
 * (module-level id-extraction helper — see extractTicketIds, unit-tested in
 * ListTickets.test.ts).
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
    SEARCH_QUERY = "Search query",
    MAX_RESULTS = "Max results",
}

enum Output {
    TOTAL_COUNT = "Total count",
    TICKET_IDS = "Ticket ids",
    TICKETS = "Tickets",
    CURL = "Curl",
}

export interface TicketEntity {
    id: string;
    status: string;
    subject: string;
}

// Module-level pure helper, exported for ListTickets.test.ts. Never a static
// class method — see no-class-self-reference.
export function extractTicketIds(tickets: TicketEntity[]): string[] {
    return tickets.map((ticket) => ticket.id);
}

export default class ListTickets extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "List tickets",
        description: "Lists tickets in Ticketing",
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
                name: Input.SEARCH_QUERY,
                description: "Enter a search query to filter tickets by subject",
                type: StreamNodeSpecificationInputType.STRING,
                example: "printer",
                mandatory: false,
            },
            {
                name: Input.MAX_RESULTS,
                description: "Enter the maximum number of tickets to return",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 25,
                defaultValue: 25,
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.TOTAL_COUNT,
                description: "Returns the number of tickets in this response for empty-result branching",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 2,
            },
            {
                name: Output.TICKET_IDS,
                description: "Returns the id of every ticket in this response",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["12345", "12346"],
            },
            {
                // Raw entity array — escape hatch for fields the curated outputs don't cover.
                name: Output.TICKETS,
                description: "Returns the full array of tickets from the API response",
                type: StreamNodeSpecificationOutputType.JSON,
                example: [{ id: "12345", status: "open", subject: "Sample ticket" }],
            },
            {
                // Curl is diagnostic, not data — MUST be last (curl-output-last).
                name: Output.CURL,
                description: "Returns the curl command equivalent of the request",
                type: StreamNodeSpecificationOutputType.STRING,
                example:
                    'curl -X GET -H "Authorization: Bearer <your-token>" "https://helmut.cloud/ticketing/api/tickets?per_page=25"',
            },
        ],
    };

    async execute(): Promise<void> {
        const baseUrl = (this.wave.inputs.getInputValueByInputName(Input.TICKETING_URL) as string).replace(
            /\/$/,
            "",
        );
        const apiKey = this.wave.inputs.getInputValueByInputName(Input.API_KEY) as string;
        const searchQuery = this.wave.inputs.getInputValueByInputName(Input.SEARCH_QUERY) as string | undefined;
        const maxResults = this.wave.inputs.getInputValueByInputName(Input.MAX_RESULTS) as number;

        const requestConfig: AxiosRequestConfig = {
            method: "GET",
            url: `${baseUrl}/api/tickets`,
            headers: { Authorization: `Bearer ${apiKey}` },
            params: this.wave.axiosHelper.removeEmptyFields({
                q: searchQuery,
                per_page: maxResults,
            }),
            timeout: 30_000,
        };

        let tickets: TicketEntity[];
        try {
            tickets = await this.wave.axiosHelper.makeRequest(requestConfig);
        } catch (err: unknown) {
            const message = (err as Error)?.message ?? "unknown error";
            if (message.includes("401")) {
                throw new Error(
                    "Could not authenticate — Ticketing rejected the Api key — verify the Api key is valid and has read access",
                );
            }
            throw new Error(
                `Could not list tickets — request failed: ${message} — verify the Ticketing url, Api key, and Search query`,
            );
        }

        this.wave.outputs.setOutput(Output.TOTAL_COUNT, tickets.length);
        this.wave.outputs.setOutput(Output.TICKET_IDS, extractTicketIds(tickets));
        this.wave.outputs.setOutput(Output.TICKETS, tickets);

        const safeCurl = this.wave.axiosHelper.convertRequestToCurl({
            ...requestConfig,
            headers: { Authorization: "Bearer <your-token>" },
        });
        this.wave.outputs.setOutput(Output.CURL, safeCurl);
    }
}
