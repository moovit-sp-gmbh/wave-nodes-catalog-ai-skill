/**
 * Shell/CLI wrapper archetype example. Wraps
 * `kubectl get pod <name> -n <namespace> -o json`. Copy to `lib/nodes/`,
 * rename the class, and adapt the allow-list regexes / binary path to your
 * own CLI.
 *
 * Demonstrates the full checklist from shell-injection-and-process-
 * execution.md: no-shell-string-injection (array argv, node:child_process
 * spawn, shell: false, never a template-string command);
 * shell-command-hardening (a positive allow-list regex on every wildcard-
 * resolved argument — see assertValidPodName / assertValidNamespace /
 * assertValidKubeconfigPath, module-level and unit-tested in
 * GetKubernetesPod.test.ts, never static class methods — see
 * no-class-self-reference — leading-dash rejection, an absolute binary path,
 * explicit env/cwd/timeout/maxBuffer, onCleanup killing the child with
 * SIGKILL on cancel); three-part-error-message on every validation and
 * non-zero-exit path; a Command output placed last for debugging (no
 * credential appears in this argv — see secrets-and-auth.md for the splice-a-
 * placeholder pattern when one does).
 *
 * Uses node:child_process instead of execa: execa isn't one of the
 * blueprint's dependencies, and the stdlib covers the array-argv-no-shell
 * pattern without adding one (stdlib-over-dependency).
 */
import { spawn } from "node:child_process";
import os from "node:os";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import Node from "../Node";

enum Input {
    POD_NAME = "Pod name",
    NAMESPACE = "Namespace",
    KUBECONFIG_PATH = "Kubeconfig path",
    TIMEOUT = "Timeout",
}

enum Output {
    POD = "Pod",
    EXIT_CODE = "Exit code",
    COMMAND = "Command",
}

// RFC 1123 DNS label — lowercase letters/digits/hyphens, no leading/trailing
// hyphen, 1-253 chars (kubectl's own limit for pod names).
const POD_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;
const NAMESPACE_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const KUBECONFIG_PATH_RE = /^[A-Za-z0-9._/\\:-]{1,4096}$/;

const KUBECTL_BIN =
    process.platform === "win32" ? "C:\\Program Files\\kubectl\\kubectl.exe" : "/usr/local/bin/kubectl";

const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

// Pure allow-list validation — module-level functions, never static methods
// on the class (no-class-self-reference). Exported for
// GetKubernetesPod.test.ts.
export function assertValidPodName(podName: string): void {
    if (!POD_NAME_RE.test(podName) || podName.startsWith("-")) {
        throw new Error("Could not run kubectl — Pod name is not a valid RFC 1123 DNS label — use lowercase letters, digits, and hyphens only (no leading hyphen)");
    }
}

export function assertValidNamespace(namespace: string): void {
    if (!NAMESPACE_RE.test(namespace) || namespace.startsWith("-")) {
        throw new Error("Could not run kubectl — Namespace is not a valid Kubernetes namespace — use lowercase letters, digits, and hyphens only");
    }
}

export function assertValidKubeconfigPath(kubeconfigPath: string | undefined): void {
    if (kubeconfigPath && !KUBECONFIG_PATH_RE.test(kubeconfigPath)) {
        throw new Error("Could not run kubectl — Kubeconfig path contains disallowed characters — use a plain absolute path with no shell metacharacters");
    }
}

export default class GetKubernetesPod extends Node {
    // The blueprint's Node base class doesn't declare onCleanup — a node that
    // assigns one must declare the field itself.
    public onCleanup?: () => Promise<void>;

    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Get kubernetes pod",
        description: "Retrieves a pod by name via kubectl and returns its json description",
        category: "Kubernetes pods",
        version: { major: 1, minor: 0, patch: 0, changelog: ["Initial release"] },
        author: { name: "helmut cloud", company: "helmut.cloud", email: "hi@helmut.cloud" },
        inputs: [
            {
                name: Input.POD_NAME,
                description: "Enter the name of the pod to retrieve (RFC 1123 DNS label)",
                type: StreamNodeSpecificationInputType.STRING,
                example: "nginx-7c5bb6d9f5-x8q2j",
                mandatory: true,
            },
            {
                name: Input.NAMESPACE,
                description: "Enter the namespace the pod lives in",
                type: StreamNodeSpecificationInputType.STRING,
                example: "default",
                defaultValue: "default",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.KUBECONFIG_PATH,
                description: "Enter the absolute path to a kubeconfig file (defaults to $KUBECONFIG or ~/.kube/config)",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/home/runner/.kube/config",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.TIMEOUT,
                description: "Enter the maximum time to wait for kubectl (in seconds)",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 30,
                defaultValue: 30,
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.POD,
                description: "Returns the pod description as parsed json",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { apiVersion: "v1", kind: "Pod", metadata: { name: "nginx-7c5bb6d9f5-x8q2j" } },
            },
            {
                name: Output.EXIT_CODE,
                description: "Returns the kubectl process exit code",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 0,
            },
            {
                name: Output.COMMAND,
                description: "Returns the resolved kubectl invocation for debugging",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "/usr/local/bin/kubectl get pod nginx-7c5bb6d9f5-x8q2j -n default -o json",
            },
        ],
    };

    async execute(): Promise<void> {
        const podName = ((this.wave.inputs.getInputValueByInputName(Input.POD_NAME) as string) ?? "").trim();
        const namespace = ((this.wave.inputs.getInputValueByInputName(Input.NAMESPACE) as string) ?? "default").trim();
        const kubeconfigPath = (this.wave.inputs.getInputValueByInputName(Input.KUBECONFIG_PATH) as string | undefined)?.trim();
        const timeoutSeconds = Number(this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) ?? 30);

        assertValidPodName(podName);
        assertValidNamespace(namespace);
        assertValidKubeconfigPath(kubeconfigPath);
        if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 600) {
            throw new Error(
                "Could not run kubectl — Timeout is out of range — set Timeout to a positive number of seconds, max 600",
            );
        }

        const args: string[] = ["get", "pod", podName, "-n", namespace, "-o", "json"];

        const env: NodeJS.ProcessEnv = {
            PATH: process.platform === "win32" ? "C:\\Windows\\System32;C:\\Program Files\\kubectl" : "/usr/local/bin:/usr/bin:/bin",
            HOME: os.homedir(),
        };
        if (kubeconfigPath) env.KUBECONFIG = kubeconfigPath;

        this.wave.outputs.setOutput(Output.COMMAND, [KUBECTL_BIN, ...args].join(" "));

        let child: ReturnType<typeof spawn> | undefined;
        this.onCleanup = async () => {
            if (child && !child.killed) child.kill("SIGKILL");
        };

        try {
            const { stdout, exitCode } = await new Promise<{ stdout: string; exitCode: number | null }>(
                (resolve, reject) => {
                    child = spawn(KUBECTL_BIN, args, { env, cwd: os.homedir(), shell: false });
                    let stdoutBuf = "";
                    let stderrBuf = "";
                    let bufferedBytes = 0;
                    let settled = false;

                    const timeoutHandle = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        child?.kill("SIGKILL");
                        reject(Object.assign(new Error("timed out"), { timedOut: true }));
                    }, timeoutSeconds * 1000);
                    const cancelIntervalId = setInterval(() => {
                        if (this.wave.general.isCanceled() && child && !child.killed) {
                            child.kill("SIGKILL");
                            clearInterval(cancelIntervalId);
                        }
                    }, 1000);

                    child.stdout?.on("data", (chunk: Buffer) => {
                        bufferedBytes += chunk.length;
                        if (bufferedBytes > MAX_BUFFER_BYTES) {
                            if (!settled) {
                                settled = true;
                                child?.kill("SIGKILL");
                                reject(Object.assign(new Error("kubectl output exceeded the buffer limit"), { maxBufferExceeded: true }));
                            }
                            return;
                        }
                        stdoutBuf += chunk.toString("utf8");
                    });
                    child.stderr?.on("data", (chunk: Buffer) => {
                        stderrBuf += chunk.toString("utf8");
                    });
                    child.on("error", (err) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timeoutHandle);
                        clearInterval(cancelIntervalId);
                        reject(err);
                    });
                    child.on("close", (code) => {
                        clearTimeout(timeoutHandle);
                        clearInterval(cancelIntervalId);
                        if (settled) return;
                        settled = true;
                        if (code !== 0) {
                            reject(Object.assign(new Error(stderrBuf.trim() || `exited with code ${code}`), { exitCode: code }));
                            return;
                        }
                        resolve({ stdout: stdoutBuf, exitCode: code });
                    });
                },
            );

            this.wave.outputs.setOutput(Output.EXIT_CODE, exitCode ?? 0);
            let parsed: unknown;
            try {
                parsed = JSON.parse(stdout);
            } catch {
                throw new Error("Could not run kubectl — kubectl returned non-json output — verify the kubectl version supports -o json");
            }
            this.wave.outputs.setOutput(Output.POD, parsed);
        } catch (err: unknown) {
            if (err instanceof Error && err.message.startsWith("Could not run kubectl")) throw err;
            const e = err as { exitCode?: number | null; timedOut?: boolean; maxBufferExceeded?: boolean; message?: string };
            if (typeof e.exitCode === "number") this.wave.outputs.setOutput(Output.EXIT_CODE, e.exitCode);
            if (e.timedOut) {
                throw new Error(`Could not run kubectl — process did not finish within ${timeoutSeconds} seconds — increase Timeout or check cluster reachability`);
            }
            if (e.maxBufferExceeded) {
                throw new Error("Could not run kubectl — output exceeded the 10 MB buffer limit — the pod description is unusually large, check the cluster");
            }
            const message = e.message ?? "unknown error";
            throw new Error(`Could not run kubectl — process exited with code ${e.exitCode ?? "unknown"} — ${message}`);
        }
    }
}
