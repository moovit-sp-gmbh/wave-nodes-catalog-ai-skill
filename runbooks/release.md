# Versioning, publishing, importing

Use this when: versioning, tagging, publishing to S3, or importing a catalog into Stream Designer.

Script paths below assume the skill is installed at `.agents/skills/create-high5-nodes/`; adjust the prefix to wherever it actually lives. Run them from the catalog root.

Work the checkpoints in order. Each has five parts: **Gather** (what to open or run), **Decide** (what you settle yourself), **Ask** (what needs the human — "nothing" is a valid value; see `../procedures/ask.md`), **Produce** (files or messages), **Done when** (the observable condition that lets you move on).

## 0. Environment and release-hygiene sweep

**Gather:** run `node .agents/skills/create-high5-nodes/scripts/check-env.mjs`; run `node .agents/skills/create-high5-nodes/scripts/verify.mjs` across the whole catalog (no `--node` — a release ships everything); `git status`.
**Decide:** confirm every hygiene item — verify passes; `minimumEngineVersion` is a released version, no `-dev` suffix; no build artifacts or stray files are staged (`bundle.js`, `bundle.js.map`, `.orig`, `.bak`, half-deleted refactor leftovers — reconcile every untracked/modified file `git status` shows); every node has a wavedoc sidecar; `index.ts` registers every node under `lib/nodes/`; the catalog `name`/`description` in `index.ts` are not the blueprint placeholders (`"example name"` / `"example description"`); `logoUrl` is a publicly fetchable image URL (no authentication; Stream Designer loads it from the user's browser).
**Ask:** if `logoUrl` is still a placeholder, ask the human for a real one — a release can't ship without it, Stream Designer fetches it from the user's browser.
**Produce:** the hygiene checklist with each item marked pass/fail, and the `logoUrl` question if needed.
**Done when:** every hygiene item passes and `logoUrl` is real.

## 1. Classify the catalog version bump

**Gather:** `changelog.json` entries since the last `v*` tag (or every entry, on a first release).
**Decide:** classify per `../references/changelog-and-versioning.md` — any breaking node change → major bump; additions with nothing breaking → minor; fixes only → patch. A first public release is normally `v1.0.0`.
**Ask:** confirm the bump with the human — this is a real decision. Propose-and-confirm: "I'd call this a minor bump — two new nodes, nothing breaking. Sound right, or do you read it differently?"
**Produce:** the confirmed version number.
**Done when:** the human has confirmed the bump.

## 2. Changelog top entry

**Gather:** the confirmed version from checkpoint 1.
**Decide:** nothing new — entries were drafted as changes landed (per `change.md` checkpoint 7 and `build.md` checkpoint 8).
**Ask:** nothing.
**Produce:** the top entry in `changelog.json` — version, date, changes array, per `../references/changelog-and-versioning.md`'s format. If `scripts/check-changelog.mjs <version>` exists in the catalog (the blueprint ships it), run it and fix any mismatch it flags.
**Done when:** the top entry exists, matches the confirmed version, and — if present — `check-changelog.mjs` passes.

## 3. Publish

**Gather:** the catalog's `.github/workflows/upload-to-s3.yaml` (the blueprint ships it).
**Decide:** nothing — the workflow's shape is fixed; the author only supplies values.
**Ask:** ASK the human for every one of: the S3-compatible endpoint, the bucket name, the public read endpoint, the region, the destination path (edited into the workflow file's placeholders), and the two GitHub Actions secrets — access key id, secret access key, named however the author chooses. Never invent or default any of these seven values. The no-reply fallback does **not** apply here: if any value is missing and no reply is possible, stop and list exactly what's missing — don't guess, don't proceed.

Then, separately, ASK before the push: "Tag `vX.Y.Z` and push it? This publishes the catalog to `<public endpoint>/<dest_dir>` and cannot be undone." Having the seven values is not consent to publish. Run the commands below only on an explicit yes; with no reply possible, stop here and hand the commands to the human.
**Produce:** once every value is confirmed in the workflow file, both secrets are set in GitHub, and the human said yes to the push:

```
git add .
git commit -m "..."
git tag vX.Y.Z
git push origin vX.Y.Z
```

The workflow prints `<url>/index.json` — the registry URL.
**Done when:** the tag is pushed and the workflow has printed the registry URL, or — missing values — the exact list has been handed to the human.

## 4. Import into Stream Designer

**Gather:** the registry URL from checkpoint 3.
**Decide:** nothing.
**Ask:** nothing.
**Produce:** tell the human: first import — Stream Designer → **Manage node catalogs** → **Add external catalog** → paste the URL. Later releases — the same dialog lists the versions from `index.json`; a space admin selects the new one per space, nothing updates by itself, and streams already saved keep the version they were built with (`../references/catalog-and-distribution.md`, "How a customer picks up a new version"). Note the caching behavior — the Agent caches a downloaded catalog by version, so a same-version re-upload is not picked up; bump the version to force a refresh.
**Done when:** the human has the URL and knows the import and update steps.

## 5. Done when

The tag is pushed and the human has the registry URL — or the human has the exact list of missing publish values, with nothing invented in their place.
