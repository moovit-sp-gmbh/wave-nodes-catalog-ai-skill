import {
    assertValidPodName,
    assertValidNamespace,
    assertValidKubeconfigPath,
} from "../../lib/nodes/GetKubernetesPod";

describe("assertValidPodName", () => {
    it("accepts a valid RFC 1123 pod name", () => {
        expect(() => assertValidPodName("nginx-7c5bb6d9f5-x8q2j")).not.toThrow();
    });

    it("rejects a leading hyphen (flag injection)", () => {
        expect(() => assertValidPodName("-o=json")).toThrow(/not a valid RFC 1123/);
    });

    it("rejects shell metacharacters", () => {
        for (const malicious of ["pod; rm -rf /", "pod && curl evil.com", "pod`whoami`", "pod$(whoami)", "pod|cat /etc/passwd"]) {
            expect(() => assertValidPodName(malicious)).toThrow();
        }
    });

    it("rejects uppercase characters", () => {
        expect(() => assertValidPodName("Nginx")).toThrow();
    });

    it("rejects an empty string", () => {
        expect(() => assertValidPodName("")).toThrow();
    });
});

describe("assertValidNamespace", () => {
    it("accepts a valid namespace", () => {
        expect(() => assertValidNamespace("default")).not.toThrow();
    });

    it("rejects a leading hyphen", () => {
        expect(() => assertValidNamespace("-n")).toThrow(/not a valid Kubernetes namespace/);
    });

    it("rejects shell metacharacters", () => {
        expect(() => assertValidNamespace("default; rm -rf /")).toThrow();
    });
});

describe("assertValidKubeconfigPath", () => {
    it("accepts undefined (falls back to $KUBECONFIG or ~/.kube/config)", () => {
        expect(() => assertValidKubeconfigPath(undefined)).not.toThrow();
    });

    it("accepts a plain absolute path", () => {
        expect(() => assertValidKubeconfigPath("/home/runner/.kube/config")).not.toThrow();
    });

    it("rejects a path containing shell metacharacters", () => {
        expect(() => assertValidKubeconfigPath("/tmp/config; rm -rf /")).toThrow(/disallowed characters/);
    });
});
