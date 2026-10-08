# catena-connect-sdk

Monorepo for the Catena Connect embed SDKs: thin client wrappers for embedding
Catena's telematics-connection flow in your own application.

| Package | npm | Status |
| --- | --- | --- |
| `packages/connect-sdk` | [`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk) | The core SDK |
| `packages/connect-sdk-react` | [`@catenaclearing/connect-sdk-react`](https://www.npmjs.com/package/@catenaclearing/connect-sdk-react) | The React wrapper: a hook and a component over the core SDK |

## The core SDK

`open()` renders the connection flow on your page and reports the outcome
through five typed callbacks. It checks whether the browser will run the flow
in an iframe, and if not falls back to a popup window, then to a redirect in
the current tab. The iframe and popup paths deliver every callback. The
redirect path navigates away from the page holding your callbacks, so its
outcome comes back through `resume()` on the page the flow returns to. No
runtime dependencies. The surface it renders is inside a shadow root.

The [package README](packages/connect-sdk/README.md) covers the options, the
events, the three modes, `resume()`, and the cases where no callback arrives.
The flow can also be embedded with no package at all, from a URL and a
`postMessage` listener you write yourself; the
[Without the package](packages/connect-sdk/README.md#without-the-package)
section documents the launch URL parameters and the message shape. When an
embed shows a button instead of the flow or never calls back, the
[Troubleshooting](packages/connect-sdk/README.md#troubleshooting) section goes
from the symptom to the fix.

## Development

Node `^24.15 || >=26` (see `.nvmrc`) and pnpm via corepack. Node 25 is
excluded on purpose: jsdom does not support it.

```sh
pnpm install
pnpm check      # Biome lint + format check, then the publication and changeset checks
pnpm tsc        # TypeScript type-check
pnpm test       # Vitest
pnpm build      # tsup build for every package, then the publication check
```

`pnpm check:fix` applies Biome's auto-fixes. CI runs the four commands above
in that order.

### Browser tests

jsdom loads no frames and has no network, so the iframe check's timing is
tested in real browsers as well. `e2e/servers.mjs` serves a partner page on
`https://localhost:4601` and a stand-in for the connect origin on
`https://127.0.0.1:4602`, two different sites, so the check runs as a real
cross-site frame. The embed key carries the scenario: `doc=4000;set=300` holds
the check page for four seconds and its cookie request for 300ms.

```sh
pnpm exec playwright install chromium firefox webkit   # once
pnpm build
pnpm test:e2e
```

`SDK_DIST=/path/to/dist pnpm test:e2e` runs the same scenarios against another
build, such as an earlier release. CI runs them in a job of their own.

### Publication check

Everything in this repository is public, and `packages/` is also bundled into
other people's pages. `scripts/check-publication-hygiene.mjs` fails `pnpm check`
and `pnpm build` if it finds an issue identifier, an issue-tracker URL, an
internal hostname, or user-agent sniffing anywhere under `packages/`, including
the built bundle. It runs against the source before the build and against the
output after it.

## Releasing

Every user-facing change lands with a changeset (`pnpm changeset`). On merge to
`main`, [`release.yml`](.github/workflows/release.yml) opens or updates a
"Version Packages" PR. Merging that PR publishes the bumped packages. If a
merge to `main` starts no workflow at all, GitHub has dropped the push event:
run `release.yml` by hand from the Actions tab ("Run workflow" on `main`),
which does exactly what the push would have. The
versioning, deprecation and support policy those releases follow is the
[Versioning and support](packages/connect-sdk/README.md#versioning-and-support)
section of the package README.

How publishing is locked down:

- **CI only.** npm authenticates via trusted publishing (OIDC) from
  `release.yml`. There is no npm token in this repository, in a GitHub secret,
  or on anyone's machine. The npm org requires 2FA and disallows legacy tokens,
  and [`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk)
  is set to "require 2FA and disallow tokens". That setting is what makes the guarantee hold: the package cannot be
  published by any token-based path, so `release.yml` is the only way it
  reaches npm.
- **The exceptions are one-shot.** The placeholder packages described
  below are published manually and rarely by
  [`publish-stubs.yml`](.github/workflows/publish-stubs.yml), using a
  short-lived granular token minted for that run and revoked afterwards. The
  first publish of a new package's name goes the same way, once, through
  `bootstrap-package.yml` ("Adding a package" below). Neither path can
  publish
  [`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk).
- **The OIDC identity is three things.** The trusted publisher is bound to the
  repository, the `release.yml` workflow filename, and the `npm-bootstrap`
  deployment environment. Renaming the workflow or removing its `environment:`
  line breaks publishing.
- **Every release carries provenance.** npm signs a provenance attestation
  for each publish from `release.yml`, linking the tarball to the commit and
  workflow run that built it. The package page on npm shows it, and
  `npm audit signatures` checks it after an install. npm only accepts the
  attestation when the `repository` field in the package's `package.json`
  names this repository exactly, so that field is load-bearing.

**Adding a package.** npm attaches a trusted publisher to a package that
already exists, so a new package's name has to be published once before
`release.yml` can publish it over OIDC. A new package stays `"private": true`
until then, which keeps it invisible to the release job. The first publish is
[`bootstrap-package.yml`](.github/workflows/bootstrap-package.yml), a
`workflow_dispatch` job that takes the package directory and a version,
publishes that version from the `npm-bootstrap` environment with a short-lived
granular token stored as `NPM_STUB_TOKEN`, and deprecates it at once with a
pointer to the first real release. Afterwards the trusted publisher is attached
to the new package, the package is set to "require 2FA and disallow tokens",
and the token is revoked and the secret deleted. A small PR then removes
`private`, sets the version to the bootstrapped one and adds the `major`
changeset for the first release, and from there `release.yml` publishes the
package exactly like the core.

## Typosquat defenses

- [`defensive/`](defensive/) holds placeholder packages for the obvious
  unscoped and misspelled names (`catena-connect-sdk`, `catena-connect`,
  `catena-embed`, and a few typos). They are published once with
  [`publish-stubs.yml`](.github/workflows/publish-stubs.yml), a
  `workflow_dispatch` job that needs a short-lived granular token in the
  `NPM_STUB_TOKEN` secret. Revoke the token after the run. The workflow
  deprecates each stub with a pointer to the real package.
- [`squat-watch.yml`](.github/workflows/squat-watch.yml) runs daily, scans the
  npm registry for new packages matching "catena", and opens or updates a
  GitHub issue for anything not in
  [`scripts/squat-allowlist.json`](scripts/squat-allowlist.json). The
  unrelated `@catena` org (`@catena/sdk`, `@catena/cli`) and the `@catena-x`
  ecosystem already exist and are allowlisted. They are not ours.

## License

[MIT](LICENSE). The published packages run in other people's browsers, so
treat everything in `packages/` as public even while this repository is
private.
