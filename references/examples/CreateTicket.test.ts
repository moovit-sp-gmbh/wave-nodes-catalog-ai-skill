import { parseTicketMetadata } from "../../lib/nodes/CreateTicket";

describe("parseTicketMetadata", () => {
    it("returns undefined when the raw value is undefined", () => {
        expect(parseTicketMetadata(undefined)).toBeUndefined();
    });

    it("returns undefined when the raw value is empty or blank", () => {
        expect(parseTicketMetadata("")).toBeUndefined();
        expect(parseTicketMetadata("   ")).toBeUndefined();
    });

    it("parses a valid JSON object", () => {
        expect(parseTicketMetadata('{"team":"support"}')).toEqual({ team: "support" });
    });

    it("throws a three-part error on invalid JSON", () => {
        expect(() => parseTicketMetadata("{not json")).toThrow(/not valid JSON/);
    });

    it("throws a three-part error when the JSON value is an array", () => {
        expect(() => parseTicketMetadata("[1,2,3]")).toThrow(/not a JSON object/);
    });

    it("throws a three-part error when the JSON value is a primitive", () => {
        expect(() => parseTicketMetadata("42")).toThrow(/not a JSON object/);
    });
});
