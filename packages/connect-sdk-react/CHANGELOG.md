# @catenaclearing/connect-sdk-react

## 1.0.0-beta.2

### Minor Changes

- 4cbf0d0: Add `onConnectionDeleted`, called with `{ connectionId }` when the fleet deletes a connection from the flow. Like `onConnection` it does not end the flow. Use it to drop an id you stored from an earlier `onConnection` without waiting for your webhooks. The `ConnectConnectionDeletedEvent` type is exported from both packages.

### Patch Changes

- Updated dependencies [efcbc77]
- Updated dependencies [4cbf0d0]
  - @catenaclearing/connect-sdk@1.0.0-beta.4

## 1.0.0-beta.1

### Patch Changes

- 880f67b: Releases are now published with npm provenance, so you can check that a tarball was built from this repository by its release workflow with `npm audit signatures`. The package metadata now links to the source repository. No code change.
- Updated dependencies [880f67b]
  - @catenaclearing/connect-sdk@1.0.0-beta.1

## 1.0.0-beta.0

### Major Changes

- 4eb8d34: First release of `@catenaclearing/connect-sdk-react`, the React wrapper over `@catenaclearing/connect-sdk`: a `useCatenaConnect` hook that launches the flow and tears it down on unmount, a `<CatenaConnect />` component that renders it inline, and a `useCatenaConnectResume` hook for the page a redirected flow returns to. Every option, callback and payload is the core package's.
  
  There is nothing to migrate from. The `0.0.1` on the registry is a deprecated placeholder that reserved the name and has no API.

### Patch Changes

- 7cf7985: `useCatenaConnect` now passes your `embedKey` to the core's `preload()`, so the warmed verdict is the one the launch uses and the first `open()` still skips the loading state. Preloading also reruns when `embedKey` changes.
- Updated dependencies [7cf7985]
- Updated dependencies [c5403ff]
- Updated dependencies [e666c8d]
- Updated dependencies [5503cc4]
- Updated dependencies [7cf7985]
- Updated dependencies [ffae285]
  - @catenaclearing/connect-sdk@1.0.0-beta.0
