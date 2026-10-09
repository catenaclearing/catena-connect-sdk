# @catenaclearing/connect-sdk

## 1.0.0-beta.5

### Patch Changes

- 96b0608: Fix the inline flow when `container` sits in a different document from the one the SDK runs in, such as a modal inside a same-origin frame with `open()` called from the top window. The flow showed as an unstyled 300×150 frame and its callbacks never arrived; it now fills the container and delivers every event.

## 1.0.0-beta.4

### Minor Changes

- 4cbf0d0: Add `onConnectionDeleted`, called with `{ connectionId }` when the fleet deletes a connection from the flow. Like `onConnection` it does not end the flow. Use it to drop an id you stored from an earlier `onConnection` without waiting for your webhooks. The `ConnectConnectionDeletedEvent` type is exported from both packages.

### Patch Changes

- efcbc77: The iframe mode keeps its loading state, now with a spinner, until the flow reports it is ready, instead of removing it as the iframe mounts. Users no longer see a blank surface for the few seconds the flow takes to draw. If the flow never reports, the iframe is shown three seconds after it loads.

## 1.0.0-beta.3

### Patch Changes

- c0c32c1: A network that is slow on every request, not only the first, no longer sends a browser that supports the iframe to the "Continue in a new window" fallback.
  
  Once the iframe check's page has loaded, it now has six seconds to report rather than two and a half, which covers its cookie round trip on a connection that adds about two seconds to each request. A frame that loads and never answers, such as on an origin your embed key does not cover, now waits that long before offering the window.

## 1.0.0-beta.2

### Patch Changes

- c22f905: A slow first connection no longer sends a browser that supports the iframe to the "Continue in a new window" fallback.
  
  The iframe check now allows up to eight seconds for its page to arrive and keeps a short limit once it has loaded. A check that times out is no longer remembered for the rest of the page, so the next launch checks again. Each popup window also gets its own name, which stops Chrome logging "Unsafe attempt to initiate navigation" when a window from an earlier page is still open. Calling `preload()` when your page loads is now recommended on slow networks.

## 1.0.0-beta.1

### Patch Changes

- 880f67b: Releases are now published with npm provenance, so you can check that a tarball was built from this repository by its release workflow with `npm audit signatures`. The package metadata now links to the source repository. No code change.

## 1.0.0-beta.0

### Major Changes

- c5403ff: Add the embed API: `open()` launches the Catena Connect flow from your page, reports the outcome through five typed callbacks, and falls back from a frame to a window to the current tab so every user reaches the end of the flow. The `PACKAGE_NAME` placeholder export is removed.
  
  **Migrating from 0.0.x.** Those releases were a typed skeleton with no runtime behavior, so nothing carries over except `PACKAGE_NAME`, which is gone: if you read it, inline the string. This is the first release with an implementation behind it. The README has the full reference, `resume()` and `preload()` included, and the versioning and support policy that applies from here.

### Minor Changes

- 5503cc4: Export the `ConnectConnectionEvent` type, the payload `onConnection` receives. It was defined but missing from the package's type exports, so a handler's parameter could not be named outside an inline function. The other four event payload types were already exported; nothing else changes.
- 7cf7985: The capability probe now carries your embed key, so a page whose origin is not registered against the key, or a launch with an unknown or revoked key, falls back to the Continue button and a popup instead of mounting a frame the browser refuses to render.
  
  The probe's verdict is now held per origin and embed key. `preload()` accepts an optional `embedKey`: pass the key your launch uses and the next `open()` skips the loading state as before. Without it, `preload()` probes as it did, and an `open()` with a key runs its own probe. The fallback takes effect as the connect app starts scoping the probe to the key.

### Patch Changes

- 7cf7985: A popup the browser hands back already closed is now treated as blocked, so the flow continues in the current tab. Some blockers answer this way instead of refusing the window outright, and the launch used to report `onClose` with no outcome and never redirect.
- e666c8d: Document that `logoUrl` and `logoUrlDark` also replace the logo on the invite consent card, in both variants. The README and the option JSDoc previously said the logo rendered only in the `"full"` variant's header.
- ffae285: Document that the progress indicator shows `brandColor` only until the user has an active connection, then the flow's green success color. The README previously described the indicator as the brand color with no caveat.

## 0.0.2

### Patch Changes

- 649782c: Remove an internal tracker reference from the package's source comment, which was reaching consumers via the generated type declarations and sourcemaps.

## 0.0.1

### Patch Changes

- 99e8663: Initial skeleton release — reserves the package name and proves out the CI-only release pipeline.
