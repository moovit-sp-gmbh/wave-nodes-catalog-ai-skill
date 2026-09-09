import { hashText } from "../../lib/nodes/HashString";

describe("hashText", () => {
    it("computes the SHA-256 hash of a string (hex-encoded)", () => {
        expect(hashText("helmut")).toBe(
            "cc04effa2069db88d0b528e3448c4c19580986dd22690a9794b02c8d76544bf7",
        );
    });

    it("produces the well-known SHA-256 hash of an empty string", () => {
        expect(hashText("")).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
    });

    it("produces different hashes for different inputs", () => {
        expect(hashText("helmut")).not.toBe(hashText("cloud"));
    });
});
