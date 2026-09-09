import { extractTicketIds, TicketEntity } from "../../lib/nodes/ListTickets";

describe("extractTicketIds", () => {
    it("returns the id of every ticket in order", () => {
        const tickets: TicketEntity[] = [
            { id: "12345", status: "open", subject: "First" },
            { id: "12346", status: "closed", subject: "Second" },
        ];

        expect(extractTicketIds(tickets)).toEqual(["12345", "12346"]);
    });

    it("returns an empty array for an empty result set", () => {
        expect(extractTicketIds([])).toEqual([]);
    });
});
