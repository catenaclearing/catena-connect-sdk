# @catenaclearing/connect-sdk

## 1.0.0-beta.11

### Patch Changes

- 14e6624: Shorter READMEs. The npm pages now cover setup, the quick start, options, events and common problems, and link to docs.catenatelematics.com for the full reference. No runtime change.

## 1.0.0-beta.10

### Minor Changes

- cc5c036: The package now ships a browser build for pages without a bundler. Load `dist/connect-sdk.global.js` from a CDN such as jsDelivr or unpkg with a `<script>` tag, pinned to an exact version and an integrity hash, and call `CatenaConnect.open`, `resume` and `preload` the same way as the imported functions.

### Patch Changes

- ae6f5e3: `open()` now throws a `TypeError` when `embedKey` is empty, whitespace or not a string, instead of launching a flow the connect app refuses to show in a frame. `preload()` skips such a key without throwing. With `<CatenaConnect>`, the throw reaches your nearest error boundary, as an invalid invite URL already does.

## 1.0.0-beta.9

### Minor Changes

- b8be5e4: The overlay now has a close button, and Escape closes it while focus is on the overlay's own controls. Either one calls `onClose`, the same as a user closing the popup window, so a flow that never says it is done no longer leaves the user stuck behind the overlay. The flow comes off the overlay at once, and nothing it sends afterwards is delivered, but the overlay stays until you call `destroy()` from `onClose`, as the quick start does. An inline `container` gets no close button.
- 9a561ba: `resume()` now passes `onExit` a reason read from the failure URL: its `skip_reason` when there is one, otherwise its `status`, such as `integration-requested`. The other two modes already report the same exit with that reason. Before, `resume()` always passed an empty string. It still does when the URL carries neither parameter.
- 8eee43b: The package's own surface now follows `theme`: the loading state, the Continue button and the overlay's close button are dark under `"dark"`, and follow the device's preference when no theme is set. Before, they were always white.

### Patch Changes

- 8eee43b: The flow's iframe no longer carries `allow="clipboard-write"`. The flow never uses the clipboard, so the grant gave a cross-origin frame a permission it had no use for.
- 395920c: When the page that called `open()` is inside a frame and the browser blocks the popup, the surface now asks the user to allow pop-ups and press Continue again. Before, it fell back to the redirect mode, which in a frame navigates only the frame and loads the flow somewhere it cannot run.
- cedb813: Warn in the console when the popup window reports itself closed within moments of opening. That is what a launching page served with `Cross-Origin-Opener-Policy: same-origin` does to it, and until now it looked like the user closing the window. The warning names the header and the fix, `same-origin-allow-popups`; `onClose` is still delivered as before. The README now lists the requirement under "What you need".
- 5358899: An iframe that loads but never reports it is ready now falls back to the popup, eight seconds after its page loads, instead of being shown. The usual cause is a browser refusing to render the flow in an iframe, which used to leave the user looking at the browser's error page with no callback to your page.
- 5cecd4b: `preload()` no longer throws during a server render. Outside a browser it now does nothing, so it is safe to call from code that also runs on the server, such as a Next.js or Remix component.
- 974c1dc: Deliver the flow's callbacks from a frame whose container was attached after `open()`, or moved by a portal after the flow mounted. The frame's window is now read on each message rather than taken once at mount; before, both cases left every callback silently dropped while the flow itself ran on.
- 395920c: Calling `open()` again while the popup window is open now brings that window forward. Before, it focused the overlay behind it, or did nothing in a `container`, though the flow was in the window.
- 395920c: A relaunch now goes ahead when the finished launch's `onClose` throws. Before, the exception escaped `open()`, the old surface stayed up and the user had to click twice. The error is still reported, from its own task, the way an error from any other callback is.

## 1.0.0-beta.8

### Minor Changes

- 9fbfdcd: Add a `brandSecondary` option that sets the flow's success color, sent as `brand_secondary` on the launch URL. It replaces the green that marks a connection, including the progress indicator once the user has one. Omit it and the green stays. Like `brandColor`, it is honored only when the embed key resolves.

## 1.0.0-beta.7

### Patch Changes

- 261a1d9: The popup's window name and the redirect-mode resume record's id now take their random part from `crypto.getRandomValues` instead of `Math.random`. Neither value was ever a secret, but security scanners flagged the `Math.random` calls in the bundle as a weak random number generator. They no longer do. Behavior is otherwise unchanged.

## 1.0.0-beta.6

### Minor Changes

- 2799f65: The launch URL now carries `sdk_version`, set to this package's version, so the flow can tell which release launched a session. Nothing changes for callers, and a launch URL you build by hand should leave it off. The `@catenaclearing/connect-sdk/contract` entry adds `SDK_VERSION` and `SDK_VERSION_PARAM`.

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
