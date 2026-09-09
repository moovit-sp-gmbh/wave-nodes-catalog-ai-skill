# Shell injection and secure child-process execution

Verified against wave-engine 2.0.1 and hcloud-sdk 16.0.0 (the versions the blueprint lockfile installs on 2026-09-02). Run `scripts/check-env.mjs` to see what is installed; if it differs, re-verify the facts marked (engine) below.

## When to use

Load this reference whenever the node:

- Imports `node:child_process` directly (`exec`, `execSync`, `spawn`, `spawnSync`, `execFile`, `execFileSync`, `fork`).
- Uses a process-spawning library — `execa`, `cross-spawn`, `shelljs`, `zx`, `node-pty`.
- Wraps a CLI tool (`kubectl`, `git`, `aws`, `docker`, `terraform`, `ffmpeg`, anything shell-invoked).
- Has the word *command*, *shell*, *terminal*, *script*, *batch*, or *PowerShell* in its name or description.
- Belongs to the operating-system category (the `LinuxCommandRunnerAction` family).

If none of those apply, this reference doesn't.

## The wave-specific threat model

A wave node's `execute()` doesn't run in a vacuum. It runs inside the helmut.cloud Agent — a long-lived process on a customer's machine, typically with the host user's permissions. Anything `execute()` shells out to runs with those permissions. Command injection here is **RCE on the customer's host**.

The attacker channel inside a wave stream is **not** the workflow engineer who authored the stream — they are trusted. It is **whatever feeds the stream at runtime**:

- Webhook payload fields referenced as `{{payload.X}}`.
- Stream variables `{{variable.Y}}` (which may be sourced from external systems).
- Outputs of upstream nodes `{{node.<uuid>.output.Z}}` — including HTTP nodes whose response body is attacker-controlled.

By the time your `execute()` is called, **wildcards are already resolved**. The string the workflow engineer typed at design time and the string your code receives can be arbitrarily different. `Node#resolveInputs()` in `node_modules/wave-engine/nodes/Node.js` is the substitution boundary `(engine, verified 2.0.1)`; everything after it is data you must treat as potentially hostile.

Mental model: **resolved input = network input.** It does not matter that an upstream node "should" only emit safe values — once the value crosses the boundary into a shell-bound argument, defensive validation is mandatory.

## Shell metacharacters, by shell

Different shells, different parsers, different metacharacter sets. A single deny-list is wrong on at least one platform — which is why this document never recommends one.

**POSIX `sh`** (IEEE Std 1003.1, §2.2 "Quoting") — always special:

```
&  ;  <  >  (  )  $  `  \  "  '  <space>  <tab>  <newline>
```

Special under certain conditions: `* ? [ # ~ = %`. Reserved words: `! { } case do done elif else esac fi for if in then until while`.

**GNU bash** — POSIX superset. Additionally meaningful: `!` (history), `{...}` (brace expansion), `<(...)` / `>(...)` (process substitution), `[[ ... ]]`, `((...))`, `<<<`, `|&`.

**Windows `cmd.exe`** — different parser entirely. Dangerous: `&`, `&&`, `||`, `|`, `<`, `>`, `>>`, `^` (escape), `%VAR%` (expanded **before** quote parsing — the BatBadBut bug), `!VAR!` (delayed expansion when enabled), `"`, `(`, `)`, `,`, `;`, `=`, tab, space. `\` does **not** reliably escape `"`.

**PowerShell** — yet different: `;`, `|`, `&`, `$(...)`, `@(...)`, backtick `` ` `` as escape, `>`, `<`, `2>&1`, `--%` stop-parsing token, interpolating `"..."` vs literal `'...'`.

If a node ships for Windows, all four parsers are in scope.

## The Node.js APIs, ranked by safety

**Safe by default — use these:**

- `child_process.spawn(cmd, args, { shell: false })` — no shell. Each `args[i]` becomes a discrete `argv[i]` of the child. Shell metacharacters in `args` are inert bytes; there is no parser between Node and the child.
- `child_process.execFile(file, args)` — same, but buffers stdout/stderr. Node docs: *"Behaviors such as I/O redirection and file globbing are not supported."*
- `execa(cmd, args)` (array form) — wraps `spawn` with the same `shell: false` default.

**Forbidden when any argument is wildcard-resolved:**

- `child_process.exec(commandString)` / `execSync(commandString)` — always spawns a shell (`/bin/sh` POSIX, `process.env.ComSpec` Windows). Node's own docs: *"Never pass unsanitized user input to this function. Any input containing shell metacharacters may be used to trigger arbitrary command execution."*
- `child_process.spawn(cmd, args, { shell: true })` — converts the call into the equivalent of `exec`. As of Node v22.15 / v23.11, passing both `args` and `shell: true` is **deprecated** (DEP0190) — the args-array-is-safe-with-shell misconception is now a runtime warning.
- `execa(commandString)` (single-string form) — equivalent to `exec`.

**Library notes:**

- `execa` ≥ 6 is ESM-only; the blueprint's `package.json` (CommonJS build via esbuild) doesn't currently depend on `execa` at all — `node:child_process` covers the safe patterns below without adding a dependency. If a node genuinely needs `execa`'s ergonomics, pin a CJS-compatible version (`^5.x`) deliberately and run it through `references/dependencies.md`'s four-question test first; don't add it as a side effect of copying an example.
- `cross-spawn` is a portability layer (PATHEXT, shebangs, paths with spaces). It is **not** a security boundary. Its own README warns: *"`options.shell` … requires manual escaping … which is very error prone, especially when passing user input."*
- `shell-quote` is **not** a security tool. It has had its own CVEs (e.g., CVE-2021-42740). Do not use as a sanitizer.
- `shescape` is the best-in-class escape library if you absolutely must build a shell command string. Adding it requires the `references/dependencies.md` four-question test.

## Cross-platform pitfalls

### macOS / Linux

Shell choice changes the metacharacter set. `/bin/sh` is the minimal POSIX baseline; `/bin/bash` adds history expansion (`!`), brace expansion, process substitution; `/bin/zsh` adds yet more (globbing `*(...)`, recursive `**/`, parameter flag syntax). If you pass `-c` (and you shouldn't — see below), the shell binary you pick determines the parser.

### Windows — BatBadBut (CVE-2024-27980)

`.bat` and `.cmd` files always invoke `cmd.exe`, even when you call `spawn('mybat.bat', [userArg])` **without** `shell: true`. `cmd.exe` expands `%VAR%` before parsing quotes, so an attacker can break out of any escaping by smuggling a `"` through an environment variable. The bug existed in every major language runtime (Node, Rust, PHP, Haskell, Erlang, Go, Python, Ruby, Java).

Node's fix (≥ 18.20.2 / 20.12.2 / 21.7.3, April 2024): `child_process.spawn` and `spawnSync` now throw `EINVAL` when given a `.bat` / `.cmd` path without `shell: true`. There is an opt-out — `--security-revert=CVE-2024-27980` — and the Node team's own guidance is *"we strongly advise against doing so."* Treat it as forbidden in catalog code, scripts, and Agent configuration.

**Practical rules for Windows nodes:**

- Never spawn `.bat` / `.cmd` directly. Call the underlying `.exe`.
- Always specify the file extension when spawning (`tool.exe`, not `tool`) — otherwise `PATHEXT` may resolve to `.bat`.
- If a batch file is genuinely unavoidable, invoke it as `spawn('cmd.exe', ['/d', '/s', '/c', batPath, ...args])` with strict allow-listing of every element of `args` (no `%`, `"`, `^`, `&`, `|`, `<`, `>`, newline, CR).

## The "don't block, protect" patterns

When the node genuinely needs to pass wildcard-resolved input to a process, layer all of the following. Each is necessary; none is sufficient alone.

### 1. Array argv, no shell

```typescript
// Correct
const child = execa("/usr/local/bin/kubectl", ["get", "pod", podName, "-o", "json"]);

// Wrong — concatenation
const child = execa(`kubectl get pod ${podName} -o json`);

// Wrong — shell: true
const child = execa("kubectl", ["get", "pod", podName, "-o", "json"], { shell: true });

// Wrong — exec with template string
import { exec } from "node:child_process";
exec(`kubectl get pod ${podName}`);
```

### 2. Per-argument allow-list, applied to the resolved value

Validate at the top of `execute()`, with a **positive** regex sized to the semantic content. Sample regexes — adapt to the actual data shape:

| Argument shape | Allow-list |
|---|---|
| Filename component | `^[A-Za-z0-9._-]{1,255}$` |
| Relative POSIX path | `^[A-Za-z0-9._/-]{1,4096}$` (reject `..`, leading `/`, leading `-`) |
| Numeric ID | `^[0-9]{1,19}$` |
| Hostname | `^[A-Za-z0-9.-]{1,253}$` |
| Kubernetes resource name | `^[a-z0-9][a-z0-9-]{0,251}[a-z0-9]$` |
| Git ref | `^[A-Za-z0-9._/-]{1,255}$` (reject `..`, leading `-`) |

Run the check **inside `execute()` on the resolved value**, not on the spec example. The example is documentation; the resolved value is the attack surface.

```typescript
const POD_NAME = /^[a-z0-9][a-z0-9-]{0,251}[a-z0-9]$/;
const podName = this.wave.inputs.getInputValueByInputName(Input.POD_NAME) as string;
if (!POD_NAME.test(podName)) {
    throw new Error(
        "Could not run kubectl — Pod Name is not a valid Kubernetes object name — use lowercase letters, digits, and hyphens only (RFC 1123)",
    );
}
```

### 3. Reject leading `-` to block flag injection

If an argument is a value, not a flag, refuse anything starting with `-`. Otherwise an attacker who controls the value can inject `--output-file=/etc/passwd`, `--exec`, etc.

```typescript
if (podName.startsWith("-")) {
    throw new Error("Could not run kubectl — Pod Name starts with '-' — pod names cannot begin with a hyphen");
}
```

If the target CLI supports `--` end-of-options, prefer that:

```typescript
execa("/usr/local/bin/kubectl", ["get", "pod", "--", podName, "-o", "json"]);
```

### 4. Validate encoding and length

Reject NUL (`\0`) — POSIX `execve` truncates on NUL and many shells handle it inconsistently. Cap each argument's length to a tight bound (a pod name doesn't need to be 1 MB). The allow-list regexes above implicitly do both with `^…{1,N}$`.

### 5. Absolute paths for binaries

```typescript
// Correct
execa("/usr/local/bin/kubectl", args);

// Wrong — PATH-poisoning surface
execa("kubectl", args);
```

For cross-platform nodes, branch on `process.platform` and store the per-platform absolute path in a constant. On Windows always include the `.exe` extension.

### 6. Lock down the child environment, cwd, and timeouts

```typescript
const child = execa("/usr/local/bin/kubectl", args, {
    cwd: workingDirectory,            // explicit, never inherit
    env: { PATH: "/usr/bin:/usr/local/bin", HOME: os.homedir() },  // minimal, explicit
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    killSignal: "SIGKILL",
});
```

Do **not** pass `process.env` through to the child unfiltered. On Windows, `%CMDCMDLINE%`, `%PATHEXT%`, and similar env variables are themselves attack surfaces.

### 7. Register `onCleanup` to kill the child on cancel

A spawned process is a resource that outlives the success/fail decision if the stream is cancelled mid-run. Use the lifecycle hook from `references/cancellation-and-async.md`:

```typescript
this.onCleanup = async () => {
    if (!child.killed) child.kill("SIGKILL");
};
```

For nodes that need cooperative cancellation, also poll `this.wave.general.isCanceled()` on an interval and `child.kill("SIGKILL")` when it returns true — see `references/cancellation-and-async.md` for the `setInterval`-plus-`isCanceled()` idiom used throughout this skill.

**Kill mechanics — three details that matter:**

- **Signal choice: `SIGKILL`, not `SIGTERM`.** `child.kill()` defaults to `SIGTERM`, which the child can trap and ignore. Use `SIGKILL` explicitly for cancellation paths — uncatchable, immediate.

- **Process groups: kill the whole tree, not just the direct child.** `child.kill('SIGKILL')` only signals the immediate child. If that child spawned its own subprocesses — a shell that ran another binary, a script that forked workers, a tool that invokes a helper — the grandchildren keep running on the host after your cancel. Two ways to prevent the leak:

  ```typescript
  // POSIX — spawn with detached: true, kill the negative PID (= the whole process group)
  const child = execa("/usr/local/bin/some-tool", args, { detached: true, cleanup: false });
  this.onCleanup = async () => {
      if (child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { /* already dead */ }
      }
  };
  ```

  ```typescript
  // Windows — taskkill /T (tree) /F (force)
  import { spawnSync } from "node:child_process";
  this.onCleanup = async () => {
      if (child.pid) spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)]);
  };
  ```

  If the wrapped binary is guaranteed not to fork (a single-shot CLI like `kubectl get pod` returning JSON), direct `child.kill("SIGKILL")` is enough. If you cannot guarantee it, default to group-kill. **Command-runner nodes that execute arbitrary user input must always group-kill** — the input may contain `&`, `;`, or `&&`, producing a tree the direct kill won't reach.

- **Race window.** Between `isCanceled()` returning true and the signal landing, the child can complete a side-effect — a write, a network call, a destructive operation. For read-only operations this rarely matters; for `rm`, `kubectl delete`, `aws s3 rm`, or any mutating call, document the window in the wavedoc so the workflow engineer understands "cancel" is not "undo."

### 8. Three-part error messages

Validation failures and non-zero exit codes throw to Fail with the three-part format from `references/errors.md`:

```
Could not run kubectl — Pod Name failed validation — pod names must be lowercase letters, digits, and hyphens only
Could not run kubectl — process exited with code 1 — check kubectl stderr in the Stderr output
Could not run kubectl — process did not finish within 30 seconds — increase Timeout or check cluster reachability
```

### 9. Redacted Command output for debugging

Just as HTTP nodes ship a `Curl` output (see Step 5 of `SKILL.md`), a process-spawning node should ship a redacted **`Command`** output (`STRING`) reproducing the resolved invocation. Redaction rules from `references/secrets-and-auth.md` apply: any `STRING_PASSWORD` input that appears in the argv must be replaced with a placeholder.

```typescript
const command = ["/usr/local/bin/kubectl", "get", "pod", podName, "-o", "json"].join(" ");
this.wave.outputs.setOutput(Output.COMMAND, command);
```

If a credential is in the argv, splice the placeholder:

```typescript
const safeArgs = args.map(a => (a === token ? "<your-token>" : a));
this.wave.outputs.setOutput(Output.COMMAND, [binary, ...safeArgs].join(" "));
```

## Decision flowchart

```
Does any argument to the process come from a wildcard / input / payload / variable?
│
├── No (all literals from the spec or hard-coded constants):
│       Use array argv anyway. It is no more work, and the next refactor that
│       introduces a wildcard won't silently become unsafe.
│
└── Yes:
        1. Array argv, no shell.
        2. Per-argument positive allow-list on the resolved value.
        3. Reject leading '-' unless the value is a flag from a closed set.
        4. Absolute binary path; .exe extension on Windows; never .bat/.cmd.
        5. Explicit cwd, env, timeout, maxBuffer, killSignal.
        6. this.onCleanup kills the child on cancel.
        7. Three-part error messages on validation and non-zero exit.
        8. Redacted Command output for debugging.
```

## Anti-patterns

- **`execa("/bin/zsh", ["-c", userCommand])` / `execa("bash", ["-c", userCommand])`.** The `-c` form executes whatever string is passed inside a shell — equivalent to `shell: true`. Only acceptable in a node whose product *is* arbitrary command execution (the `MacOSCommandRunnerAction` family — see the section below); never in a node that wraps a specific CLI.
- **String concatenation into a command:** `exec(`${bin} ${arg}`)`, `execSync("kubectl get pod " + name)`, template literals around `exec`.
- **Hand-rolled `escape()` / `quote()` helpers.** BatBadBut is the proof that vendor-quality runtimes get this wrong; a 10-line helper in a catalog has zero chance.
- **Regex deny-lists of metacharacters** (`/[;&|<>]/`). Incomplete on at least one platform. Use a positive allow-list.
- **`shell-quote` used as a security boundary.** It's a parser, not a sanitizer, and has its own CVE history.
- **Passing `process.env` to the child unfiltered.** Especially dangerous for batch files on Windows.
- **Invoking `.bat` / `.cmd` directly from `spawn`** on Windows.
- **`--security-revert=CVE-2024-27980`** anywhere.
- **`shell-quote`, `shelljs.exec`, `zx`'s default template form** — all spawn a shell.
- **Not registering `onCleanup`.** Cancelling a stream then leaks the child process.
- **`STRING_PASSWORD` value spliced into the `Command` output** without placeholder substitution.

## Nodes whose product *is* arbitrary command execution

A generic "command runner" node — one whose entire contract is "run whatever the user types, per OS" (a `MacOSCommandRunnerAction` / `LinuxCommandRunnerAction` / `WindowsCommandRunnerAction`-style family) — takes a shell command as input and executes it. By the threat model above, this shape is **unsafe by design** — any wildcard wired into the `Command` input becomes RCE.

This is acceptable **only** because the node's contract is "run whatever the user types," exactly as a terminal would. Their safety relies entirely on:

- The workflow engineer not wiring an untrusted source into the `Command` input.
- The Agent being deployed under a principle of least privilege (its own user, restricted PATH, no sudo).
- The customer accepting that "Command Runner" nodes are an RCE surface by definition.

**The gate: this is the single exception to `no-shell-string-injection`, and it only opens after the human explicitly accepts the risk.** Before building a node this shape, the contract review block (`../templates/contract-review.md`) must record "user accepted arbitrary-command execution risk" as a **stated decision** — something the human was asked and affirmatively agreed to — never as a stated assumption. The no-reply fallback (`../procedures/ask.md`, "When no reply is possible") never grants this on its own; an unattended session that reaches this point without an explicit prior acceptance stops and asks, even though every other open decision in that mode falls back to its recommended default. A node built under this exception still follows every item in the hardening checklist above (argv array, allow-listed arguments, absolute binary path, cleanup on cancel, three-part errors, redacted `Command` output) — the human's acceptance covers the shape of the node, not a license to skip the hardening.

**A node wrapping a specific CLI never qualifies for this exception**, no matter how thin the wrapper. When authoring a **new** node, do not copy this pattern unless the node's purpose is also a generic command runner. A node that wraps `kubectl` is not a command runner — it has a specific argv shape and must allow-list each component; it stays under the ordinary `no-shell-string-injection` rule with no carve-out and no risk-acceptance question to ask.

If you must author a generic command runner (gate above satisfied), document the threat model in its wavedoc, reject any `Command` value containing CR/LF/NUL even though the shell would accept them, and pair it with a `Working Directory` input so the blast radius is at least bounded.

## Tests

For every process-spawning node, the test plan should include:

- **Unit tests** for the allow-list regex: feed it the metacharacter sets from this document (POSIX, bash, cmd.exe, PowerShell), high Unicode (RTL override U+202E, NBSP U+00A0, zero-width joiners), CR/LF, NUL, `%VAR%`/`` `$VAR` `` strings. Each must be rejected.
- **Snapshot test** of the resolved `argv` for a representative input. A future refactor cannot silently reintroduce string concatenation if the snapshot pins the array shape.
- **Cross-platform CI** if the node ships for Windows — BatBadBut-class bugs are platform-conditional.

See `references/testing-and-debugging.md` for the test harness.

## Sources

- [Node.js docs — `child_process`](https://nodejs.org/api/child_process.html)
- [Node.js Security Releases — April 9, 2024 (CVE-2024-27980)](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2)
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices)
- [NVD — CVE-2024-27980](https://nvd.nist.gov/vuln/detail/CVE-2024-27980)
- [RyotaK — BatBadBut: You can't securely execute commands on Windows](https://flatt.tech/research/posts/batbadbut-you-cant-securely-execute-commands-on-windows/)
- [CWE-78: OS Command Injection (MITRE)](https://cwe.mitre.org/data/definitions/78.html)
- [OWASP — OS Command Injection Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html)
- [POSIX / IEEE Std 1003.1, Shell Command Language §2.2 Quoting](https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html)
- [`cross-spawn`](https://github.com/moxystudio/node-cross-spawn)
- [`shescape`](https://github.com/ericcornelissen/shescape)

## Curiosity hooks

- The wildcard-resolution boundary lives in `node_modules/wave-engine/nodes/Node.js` (`resolveInputs()`), which calls into `node_modules/wave-engine/utils/WildcardResolver.js`. Reading both explains exactly what your `execute()` receives — see `references/wildcards-and-variables.md`.
- `execa` ≥ 6 dropped CJS support. If a future catalog migrates to ESM, the `execa` import path simplifies and `process.kill` semantics change subtly — re-test cancellation.
- The Node.js team has discussed a `child_process.execFile` flag to refuse `.bat`/`.cmd` on Windows entirely (vs the current `EINVAL` plus opt-out). Worth tracking if you author Windows nodes.
