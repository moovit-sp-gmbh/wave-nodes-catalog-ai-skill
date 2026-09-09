import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * Locates the catalog repo root by walking UP from this file's own location
 * (never from process.cwd() — the skill must work no matter what directory it
 * was invoked from) until it finds a package.json that declares `wave-engine`
 * as a dependency or devDependency. This is how every script in this skill
 * finds the repo regardless of whether the skill lives at
 * `<repo>/.agents/skills/create-high5-nodes/` or `<repo>/.claude/skills/create-high5-nodes/`
 * (or any other depth, or is itself reached through a symlink).
 *
 * @param {string} fromFileUrl - pass `import.meta.url` of the CALLING file.
 * @returns {string} absolute path to the repo root.
 */
export function findRepoRoot(fromFileUrl) {
    // Node resolves import.meta.url to the REAL path of the file, so when the
    // skill directory is a symlink to a store outside the repo (a global skills
    // store, a shared checkout), walking up from the file never reaches the
    // catalog. Try the file's own ancestry first, then fall back to the
    // directory the caller invoked from — every runbook says "run from the
    // catalog root", and that path is not affected by the symlink.
    const fromFile = walkUpForCatalog(dirname(fileURLToPath(fromFileUrl)));
    if (fromFile) return fromFile;
    const fromCwd = walkUpForCatalog(process.cwd());
    if (fromCwd) return fromCwd;
    throw new Error(
        `Could not locate a catalog repo root (package.json with a "wave-engine" dependency) ` +
            `by walking up from ${dirname(fileURLToPath(fromFileUrl))} or from the current directory ${process.cwd()}. ` +
            `Run the script from inside the catalog repo.`
    );
}

function walkUpForCatalog(startDir) {
    let dir = startDir;

    while (true) {
        const candidate = join(dir, "package.json");
        if (existsSync(candidate)) {
            try {
                const pkg = JSON.parse(readFileSync(candidate, "utf8"));
                const isCatalogRepo =
                    (pkg.dependencies && "wave-engine" in pkg.dependencies) ||
                    (pkg.devDependencies && "wave-engine" in pkg.devDependencies);
                if (isCatalogRepo) {
                    return dir;
                }
            } catch {
                // malformed package.json - keep walking up, it's not ours
            }
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

/**
 * Absolute path to a CLI binary installed in the REPO's own node_modules/.bin,
 * with the `.cmd` shim suffix on Windows. Preferred over `npx <name>` because
 * it never touches the network / npm's "install on the fly" prompt and
 * resolves deterministically regardless of the repo's package manager.
 *
 * @param {string} repoRoot
 * @param {string} name - e.g. "tsc", "eslint", "jest"
 * @returns {string} absolute path (existence is NOT checked here — callers
 *   should check `existsSync` and report a clear error if it's missing)
 */
export function bin(repoRoot, name) {
    const exe = process.platform === "win32" ? `${name}.cmd` : name;
    return join(repoRoot, "node_modules", ".bin", exe);
}

/**
 * Thin, platform-safe wrapper around `spawnSync`. Never uses `shell: true`
 * (so no bash-isms / no shell-quoting concerns on Windows) and defaults to
 * capturing output as utf8 text. Pass `stdio: "inherit"` in opts to stream
 * output live instead of capturing it.
 *
 * @param {string} cmd - absolute path or bare command name
 * @param {string[]} args
 * @param {import("node:child_process").SpawnSyncOptions} [opts]
 */
export function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, {
        encoding: "utf8",
        shell: false,
        ...opts,
    });
}

/**
 * Loads a package that lives in the REPO's node_modules (never one bundled
 * with the skill — there isn't one) in a way that survives the skill
 * directory being reached through a symlink.
 *
 * Normal resolution (`import "typescript-eslint"` from a file under the
 * skill's `lint/` or `scripts/` directory) works as long as that directory is
 * a real path inside the repo tree: Node walks up from the file looking for
 * node_modules and finds the repo's. It stops working if the skill directory
 * itself is a symlink whose REAL path lives outside the repo tree (e.g. a
 * globally-installed skill store symlinked into `.claude/skills/`) — Node
 * resolves bare specifiers against the symlink's realpath, so the upward walk
 * never reaches the repo's node_modules.
 *
 * The fix: once we already know the repo root (found via `findRepoRoot`,
 * which walks the path AS GIVEN via `fileURLToPath` and never dereferences
 * symlinks), require the package by its exact absolute path under that repo
 * root's node_modules. `require()` given an absolute path does no upward
 * search at all — it loads that path's package.json main/exports directly —
 * so the symlink problem doesn't apply.
 *
 * Limitation: this only works for CommonJS packages (all of typescript,
 * typescript-eslint, eslint's own dependencies, and jest are). A pure-ESM-only
 * package would still fail here, since `createRequire(...)` cannot load one;
 * there is no further fallback for that case.
 *
 * @param {string} fromFileUrl - `import.meta.url` of the CALLING file
 * @param {string} repoRoot - result of `findRepoRoot`
 * @param {string} specifier - bare package name, e.g. "typescript-eslint"
 */
export async function loadFromRepo(fromFileUrl, repoRoot, specifier) {
    try {
        return await import(specifier);
    } catch {
        const require = createRequire(fromFileUrl);
        const absolute = join(repoRoot, "node_modules", specifier);
        return require(absolute);
    }
}

/** Same fallback strategy as `loadFromRepo`, synchronous, for CJS-only call sites. */
export function requireFromRepo(fromFileUrl, repoRoot, specifier) {
    const require = createRequire(fromFileUrl);
    try {
        return require(specifier);
    } catch {
        return require(join(repoRoot, "node_modules", specifier));
    }
}

// Re-exported so callers that need a file URL for a resolved absolute path
// (e.g. to dynamic-`import()` it rather than `require()` it) don't need their
// own import of node:url.
export { pathToFileURL };
