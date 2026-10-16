# @catenaclearing/connect-sdk-react

## 1.0.0-beta.5

### Patch Changes

- 53834f9: `useCatenaConnect()`'s `open()` now throws when `container` is given but its ref is not attached to an element, instead of opening the flow in the full-page overlay. A throwing handler under `useCatenaConnectResume()` no longer reaches your error boundary. Its exception is rethrown in a separate task, the same way a throw from a handler in the other modes is. `<CatenaConnect />` now declares its return type as `ReactElement`, a type every `@types/react` 18 release exports, and its documentation says that an `inviteUrl` the core refuses throws from its mount effect.
- Updated dependencies [cc5c036]
  - @catenaclearing/connect-sdk@1.0.0-beta.10

## 1.0.0-beta.4

### Minor Changes

- 1b6f51f: `useCatenaConnect()` now also returns `openWith(options)`, which launches with the options you pass in place of the latest render's. Use it when you fetch the invitation on click: `open()` reads the latest render, so `setInviteUrl(url); open();` in one handler launched the previous invitation, or threw if there was none. `open()` itself is unchanged and still takes no argument, so `onClick={open}` keeps working.

### Patch Changes

- Updated dependencies [8eee43b]
- Updated dependencies [395920c]
- Updated dependencies [b8be5e4]
- Updated dependencies [cedb813]
- Updated dependencies [5358899]
- Updated dependencies [5cecd4b]
- Updated dependencies [974c1dc]
- Updated dependencies [395920c]
- Updated dependencies [9a561ba]
- Updated dependencies [8eee43b]
- Updated dependencies [395920c]
  - @catenaclearing/connect-sdk@1.0.0-beta.9

## 1.0.0-beta.3

### Minor Changes

- 9fbfdcd: Add a `brandSecondary` option that sets the flow's success color, sent as `brand_secondary` on the launch URL. It replaces the green that marks a connection, including the progress indicator once the user has one. Omit it and the green stays. Like `brandColor`, it is honored only when the embed key resolves.

### Patch Changes

- Updated dependencies [9fbfdcd]
  - @catenaclearing/connect-sdk@1.0.0-beta.8

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
