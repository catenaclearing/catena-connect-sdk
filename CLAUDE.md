# Catena Connect SDK

Monorepo for the **Catena Connect** embed SDKs — thin client wrappers that embed
Catena's telematics-connection flow in your own application.
The SDK wraps an iframe pointed at Catena; it holds no business logic and has no
shared contract with the Catena app behind it.

## ⚠️ This is a public repository

Everything here — source, comments, config, commit messages, branch names, PR
titles and bodies, issues, and this file — is world-readable. Treat every line
you write as published.

**Never commit any of the following:**

- Internal issue or ticket identifiers, issue-tracker URLs, sprint or milestone
  names, or internal project codenames. Describe *why* a change is being made,
  never *which internal ticket* asked for it. This covers branch names too: a
  tracker's suggested branch name (`abc-123-…`) carries the ID, and an ID in a
  branch name or PR title also makes the tracker's bot post a linkback comment,
  with the ticket's title, on the public PR. Name branches after the change.
- Names, email addresses, or handles of employees, customers, or anyone else,
  including in commit messages and code comments.
- Internal hostnames, internal URLs, account IDs, org chart or team structure,
  or customer lists.
- Dated roadmap or delivery commitments. Naming a capability we intend to build
  is fine and useful to consumers; attaching a date, quarter, or internal
  milestone to it is not.
- Anything resembling a credential — tokens, keys, secret names paired with
  their values. (Naming a GitHub *secret* is fine; its value never is.)
- Open security gaps. Documenting the hardening that **is** in place is good and
  intentional. A public to-do list of what is **not** yet hardened is an
  attacker's checklist — that belongs in the internal tracker, not in the repo.

If a commit or comment needs internal context to make sense, write the context
itself in plain terms rather than pointing at an internal system.

Published package code additionally runs inside other people's browsers, so
`packages/` is public in the strongest sense — assume anything shipped there is
read, bundled, and inspected by third parties.

## Project Structure

```
packages/
  connect-sdk/        # @catenaclearing/connect-sdk — the core package
    src/              # Source; src/*.test.ts are the Vitest tests
    dist/             # tsup output (gitignored, built in CI)
  connect-sdk-react/  # @catenaclearing/connect-sdk-react — hook, component and resume hook over the core
e2e/                  # Playwright: the iframe check in real browsers, slowable stand-in connect origin
defensive/            # Typosquat placeholder packages — NOT workspace members
scripts/
  squat-watch.mjs     # Daily npm registry scan
  squat-allowlist.json
.changeset/           # Changesets — one per user-facing change
.github/workflows/    # ci.yml, release.yml, publish-stubs.yml, squat-watch.yml
.github/CODEOWNERS    # One maintainers team owns everything; its review gates every merge
```

`defensive/` is deliberately excluded from `pnpm-workspace.yaml` so changesets
and `pnpm -r` never touch it. Do not add it to the workspace.

## Key Commands

| Command | Purpose |
|---|---|
| `pnpm check` | Biome lint + format check, then the publication and changeset checks |
| `pnpm check:fix` | Auto-fix Biome lint + format issues |
| `pnpm tsc` | TypeScript type-check (no emit) |
| `pnpm test` | Vitest |
| `pnpm build` | tsup build for every workspace package |
| `pnpm test:e2e` | Playwright: the iframe check in real browsers against a slowable stand-in connect origin (`e2e/`); needs `pnpm build` first |
| `pnpm changeset` | Author a changeset |

After any code change run `pnpm check`, `pnpm tsc`, `pnpm test`, `pnpm build` —
these are exactly the four steps `ci.yml`'s `verify` job runs, in that order.
Its `e2e` job then builds and runs `pnpm test:e2e`; run that too after changing
the probe, the modes or anything timing-related. If `check` reports fixable
issues, run `pnpm check:fix` and re-validate all four.

Node `^24.15 || >=26` (`.nvmrc`), pnpm via corepack (`packageManager` pins the
version). The 25 line is deliberately excluded rather than merely untested —
jsdom does not support it, so `engines` names the two ranges rather than a
floor.

## General Constraints

- Do NOT add dependencies without stating what and why. The published package
  ships to other people's browsers — it should stay dependency-free.
- Do NOT casually edit `.github/workflows/release.yml`. Its OIDC identity is
  bound to the repository, the workflow *filename*, and the `npm-bootstrap`
  environment; renaming the file or dropping the `environment:` line silently
  breaks publishing.
- Do NOT add an npm token anywhere. There is deliberately none in this repo.
- U.S. English spelling throughout.
- Public documentation (both READMEs, the changelog, anything npm renders) names
  the package by its exact scoped name `@catenaclearing/connect-sdk`, shows the
  exact command `npm install @catenaclearing/connect-sdk` wherever an install
  is meant (with the `@beta` suffix while `.changeset/pre.json` is in beta
  mode, removed in the same PR that exits it), and links the name to
  https://www.npmjs.com/package/@catenaclearing/connect-sdk. Never a bare or
  paraphrased name ("the connect SDK package"): look-alike packages exist, and
  a reader who types the name from memory can land on one.
- Workflow action versions are pinned to a commit SHA with a `# vX.Y.Z` comment.
  Keep that convention when bumping.

## Release Pipeline

Publishing is **CI-only and OIDC-only**. There is no npm token in the repo, in a
secret, or on anyone's machine, and the package requires 2FA and disallows
token publishes — a local `npm publish` cannot succeed.

Flow:

1. A PR lands on `main` with a changeset.
2. `release.yml` runs `changesets/action`, which opens or updates a
   **"Version Packages"** PR (bumps versions, writes `CHANGELOG.md`).
3. Merging that PR triggers `release.yml` again, which runs `pnpm release`
   (`pnpm build && changeset publish`) and publishes via npm trusted
   publishing (OIDC).

Notes:

- `npm install -g npm@<exact version>` in the job is required — OIDC trusted
  publishing needs npm >= 11.5.1, and the npm bundled with a Node release is
  pinned at whatever shipped with it. Do not drop the step on the assumption
  that a newer Node makes it redundant; check the bundled version first. The
  version is pinned exactly, never `@latest`, so the npm that publishes only
  changes through a reviewed PR. To bump it, pick a release whose `engines`
  covers `.nvmrc` (`npm view npm@<version> engines`).
- The job runs in the `npm-bootstrap` environment. That environment name is part
  of the OIDC subject, so the npm trusted publisher is configured with it. Keep
  the environment.
- `persist-credentials: false` on checkout keeps the write-capable token out of
  `.git/config` during `pnpm install`; git auth is set explicitly afterwards for
  the changesets push.

### Provenance

npm attaches a provenance attestation automatically to a trusted (OIDC)
publish of a public package from a public repository — there is no
`--provenance` flag or `NPM_CONFIG_PROVENANCE` to set, and adding one changes
nothing. A private repository gets no provenance at all.

Provenance validates each published `package.json`'s `repository.url` against
the repository it is published from, case-sensitively, and the publish
**fails** on a mismatch or a missing field. Every published package therefore
carries the same `repository` block, with its own `directory`:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/catenaclearing/catena-connect-sdk.git",
  "directory": "packages/connect-sdk"
}
```

A new package needs that block before its first OIDC publish, and renaming or
transferring the repository means updating it in every package.

## Changesets

Every PR that changes published package code needs a real changeset
(`pnpm changeset`, target `@catenaclearing/connect-sdk`, one user-facing line).
Use an **empty** changeset (`---\n---`) for changes with no runtime effect:
CI/workflow config, docs, `defensive/`, `scripts/`. An empty changeset next to a
real code change is a bug, not a style choice. The one exception is a package
that is still `"private": true` and unpublished: changesets neither versions
nor publishes it, so its PRs carry empty changesets until the PR that removes
`private`, which carries the `major` changeset for the first release.

A changeset body is a changelog entry, written for a stranger deciding whether
to upgrade. `pnpm check` enforces the measurable parts through
`scripts/check-changesets.mjs`; the rest is review:

- A headline sentence plus at most one short paragraph, 120 words in total
  (enforced).
- Lead with anything install-affecting: a removed export, a renamed option, a
  changed default.
- A `major` carries a migration note saying what a user on the previous major
  does (enforced: the body must contain a whole-word form of "migrate", such
  as "migrate", "migrating" or "migration").
- Never reference another changeset by filename. The reader sees the entry in
  `CHANGELOG.md`, where the filename means nothing.
- PR notes (review context, what was tried, why not the other way) belong in
  the PR, not in the entry.

The published form of this rule is the "Versioning and support" section of
`packages/connect-sdk/README.md`. Change the policy there first, then here and
in the check together.

Deprecating a covered export, option, callback or payload field is a minor
release, and the PR that does it makes three edits, one per channel the README
promises: a `minor` changeset whose entry announces the deprecation and names
the replacement; the symbol's JSDoc gains `@deprecated` with the same
replacement in the tag, so editors flag it through the published type
declarations (for a payload field, the tag sits on that property of the
payload type); and the symbol is added to the **Currently deprecated** list in
the README's "Deprecation" subsection. The tag and the list entry stay until
the major that removes the symbol; that major's changeset carries the
migration note and deletes the list entry. Nothing is deprecated today, so the
list reads "Nothing" until the first one.

## Typosquat Defenses

Six placeholder packages in `defensive/` hold the obvious unscoped and
misspelled names: `catena-connect-sdk`, `catena-connect`, `catena-embed`,
`catena-conect`, `catenna-connect`, `catena-connct-sdk`. Each is pinned at
`1.0.0`, throws on require, and carries a deprecation message pointing at the
real package. All six were published and deprecated in the initial rollout —
confirm the current registry state with `npm view <name> deprecated` rather than
trusting this line, which can drift.

`publish-stubs.yml` is a manual (`workflow_dispatch`) one-shot, and needs an npm
token — which deliberately does not exist. Running it again means minting a
short-lived granular token, storing it as `NPM_STUB_TOKEN` on the
`npm-bootstrap` environment, running the workflow, then revoking the token and
deleting the secret. Only do this if a stub genuinely needs republishing.

**npm quirks the workflow already works around.** Each of these cost a
round-trip to discover; do not "simplify" them away:

- A published version number is burned permanently. Unpublishing does not free
  it, even after npm's 24h block lifts. To republish a stub, **bump the version**
  in every `defensive/*/package.json`.
- `npm deprecate` exits **0 without doing anything** when the write packument has
  not yet listed the version (for seconds after a publish). Always read the value
  back with `npm view <spec> deprecated` rather than trusting the exit code.
- Re-applying an identical deprecation message fails with E422, so stubs already
  carrying the right message are skipped.
- The bare-name form of `npm deprecate` intermittently fails with "Cannot convert
  undefined or null to object". Always pass an explicit `name@version`.

`squat-watch.yml` runs daily at 06:17 UTC, scans the npm registry for new
packages matching "catena", and opens or comments on a GitHub issue for anything
not in `scripts/squat-allowlist.json`. Triage: unrelated package → add it to the
allowlist; a real squat → file an npm abuse report. The unrelated `@catena` org
and the whole Catena-X / `@catena-x` ecosystem are already allowlisted — they
are not ours.

## The React wrapper

`packages/connect-sdk-react` is `@catenaclearing/connect-sdk-react`, the only
wrapper there is; the package supports plain JavaScript and React, nothing
else. Its source is small and flat:

- `src/use-catena-connect.ts` — the launch hook; holds the handle, tears the
  launch down on unmount, runs the core's `preload()` in an effect.
- `src/catena-connect.tsx` — the inline component: the hook on a `div` it owns.
- `src/use-catena-connect-resume.ts` — the core's `resume()` as a mount effect.
- `src/latest.ts` — the latest-handler forwarding: a ref refreshed in a layout
  effect (aliased to `useEffect` on the server) and five stable forwarders.
- `src/test-utils.tsx` — test-only mount helpers; never imported from
  `src/index.ts`. Tests sit beside their source as `src/*.test.ts(x)`.

It copies the shape of `packages/connect-sdk`: a `tsup` dual ESM/CJS build
with `dts`, the same `exports` map, `files: ["dist"]`, `sideEffects: false`,
and `publishConfig.access: "public"`. Two compatibility details carry over,
and they live in **different files**: the package's own `package.json` pins
`typescript@~6` as a devDependency (the tsup dts worker needs it — TS7 has no
JS compiler API), while its `tsconfig.json` sets `ignoreDeprecations` for the
`baseUrl` that tsup injects. Its tsup config adds a `"use client"` banner to
every emitted file so a server-components application can render the
component from a server tree; the directive is inert everywhere else.

The package stays `"private": true` until its name exists on the registry.
npm attaches a trusted publisher to an existing package only, and a public
workspace package whose version is not on the registry would make the next
Version Packages merge try, and fail, to publish it over OIDC. The first
publish is the one-shot `bootstrap-package.yml`; the runbook, including the
flip PR that removes `private` afterwards, is the "Adding a package"
paragraph under "Releasing" in the root `README.md`.

## Reference Docs

Do not rely on training data for these — fetch the docs when uncertain:

- Changesets: https://github.com/changesets/changesets/tree/main/docs
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
- tsup: https://tsup.egoist.dev
- Biome (v2): https://biomejs.dev/reference
- Vitest: https://vitest.dev/api
