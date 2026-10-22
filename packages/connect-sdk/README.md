# @catenaclearing/connect-sdk

Embed SDK for Catena Connect. Connect fleet telematics to
[Catena](https://catenaclearing.io) from your own application.

One call renders the connection flow on your page and tells you how it ended.
The package has no runtime dependencies. The full documentation is at
[docs.catenatelematics.com](https://docs.catenatelematics.com/get-started/connect-sdk/overview).

## What you need

**An invitation URL.** Create invitations in the Catena dashboard or through
the Catena API, and hand the URL to your page from your own server.

**An embed key.** Catena issues it.

**A registered origin.** Every page that launches the flow must be on an
origin registered against your embed key, and Catena registers the origins
you give it. Scheme, host and port must match exactly, so `www` and the apex
are different origins. On an unregistered origin the flow still runs, in a
popup, but its messages never reach your page.

**Popups kept connected.** If the launching page sends a
`Cross-Origin-Opener-Policy` header, it must be `same-origin-allow-popups` or
`unsafe-none`.

## Install

```sh
npm install @catenaclearing/connect-sdk
```

Copy the name from here or from
[npmjs.com/package/@catenaclearing/connect-sdk](https://www.npmjs.com/package/@catenaclearing/connect-sdk).
Look-alike packages exist. The only official ones are this package and
[`@catenaclearing/connect-sdk-react`](https://www.npmjs.com/package/@catenaclearing/connect-sdk-react).

### From a script tag

Without a bundler, load the browser build from a CDN. It defines a global,
`CatenaConnect`, with the same `open`, `resume` and `preload`.

```html
<script
  src="https://cdn.jsdelivr.net/npm/@catenaclearing/connect-sdk@VERSION/dist/connect-sdk.global.js"
  integrity="sha384-HASH"
  crossorigin="anonymous"
></script>
```

Pin an exact `VERSION`, `1.0.0` or later. Compute `HASH` from the
package on npm, not from the file the CDN serves:

```sh
TARBALL=$(npm pack @catenaclearing/connect-sdk@VERSION --@catenaclearing:registry=https://registry.npmjs.org/)
tar -xOzf "$TARBALL" package/dist/connect-sdk.global.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

The [docs](https://docs.catenatelematics.com/get-started/connect-sdk/overview#install)
cover Content Security Policy for the script tag.

## Quick start

```js
import { open } from "@catenaclearing/connect-sdk";

button.addEventListener("click", () => {
  const connect = open({
    inviteUrl,
    embedKey,
    onSuccess: ({ connectionIds }) => continueYourFlow(connectionIds),
    onExit: ({ reason }) => offerRetry(reason),
    onClose: () => connect.destroy(),
  });
});
```

The flow renders in an iframe on your page. If the browser won't run it
there, it falls back to a popup, and then to the current tab. The package
never removes its surface on its own, so call `destroy()` from `onClose`.

## If the browser blocks the popup

If a browser blocks both the iframe and the popup, the flow takes over the
tab. When it finishes, it sends the user to the success or failure URL on
your invitation, if the invitation has them. Call `resume()` on each of those
pages to get the outcome. If the page that calls `open()` is itself inside a
frame, the flow never takes over the tab. The surface stays and asks the user
to allow pop-ups.

```js
import { resume } from "@catenaclearing/connect-sdk";

// On your success page
resume({
  outcome: "success",
  onSuccess: ({ connectionIds }) => continueYourFlow(connectionIds),
});

// On your failure page
resume({
  outcome: "exit",
  onExit: ({ reason }) => offerRetry(reason),
});
```

Both pages must be on the same origin as the page that called `open()`.

## Options

`open(options)` returns `{ destroy() }`.

| Option | Type | Required | Notes |
| --- | --- | --- | --- |
| `inviteUrl` | `string` | yes | Must be `https`. Plain `http` works only on `localhost`, `127.0.0.1` and `[::1]`. |
| `embedKey` | `string` | yes | |
| `container` | `HTMLElement` | no | Render inline instead of in the package's overlay. Give it a height of at least 480px. |
| `variant` | `"full" \| "card" \| string` | no | `"card"` drops the header and suits the overlay or a small container. |
| `theme` | `"light" \| "dark" \| string` | no | Forces the color scheme. Omit it to follow the user. |
| `brandColor`, `brandSecondary` | `string` | no | Six hex digits. |
| `logoUrl`, `logoUrlDark` | `string` | no | Absolute `https` URLs. |
| `onOpen`, `onConnection`, `onConnectionDeleted`, `onSuccess`, `onExit`, `onClose` | callbacks | no | See [Events](#events). |

`variant` and `theme` also accept other strings, so a value the flow adds
later works without an upgrade. The branding options apply only when the
embed key is valid.

`preload({ inviteUrl, embedKey })` is optional. It runs the iframe check
before the click, so `open()` starts faster. `embedKey` is optional too, but
pass the same key you'll pass to `open()`, or `open()` has to run the check
again.

The [JavaScript reference](https://docs.catenatelematics.com/get-started/connect-sdk/javascript-reference)
covers every option, `resume()` and `preload()` in full.

## Events

| Callback | Meaning | Payload |
| --- | --- | --- |
| `onOpen` | The flow is ready. It can arrive more than once. | none |
| `onConnection` | One provider was connected. The flow is still running. | `{ connectionId: string }` |
| `onConnectionDeleted` | The fleet deleted a connection. The flow is still running. | `{ connectionId: string }` |
| `onSuccess` | The user finished and chose to come back to you. | `{ connectionIds: string[] }` |
| `onExit` | The flow ended without success. | `{ reason: string }` |
| `onClose` | The surface should be dismissed. | none |

`onSuccess` means the user pressed the button on the success screen (**Done**
in the iframe, **Return to** followed by your name in a popup or redirected
tab), not that a connection was made.
A user can connect a provider and close the tab. Use your connection webhooks
as the record of what was connected.

If the invitation can't be loaded, `onExit` arrives with `invalid_invitation`
(the link is wrong, so a retry won't help) or `invitation_unavailable` (try
again).

More detail in [Events and outcomes](https://docs.catenatelematics.com/get-started/connect-sdk/events).

## Troubleshooting

**The surface shows "Continue" instead of the flow.** Usually the page's
origin isn't registered against your embed key, or your Content Security
Policy doesn't allow the invitation URL's origin in `frame-src`.

**No callback arrives.** Usually an unregistered origin. Your webhooks still
record the connections.

**`onClose` arrives as soon as the popup opens.** The launching page sends
`Cross-Origin-Opener-Policy: same-origin`. Change it to
`same-origin-allow-popups`.

**Branding is ignored.** The embed key isn't valid, or a value is malformed.

**`open()` throws.** The invitation URL doesn't parse or isn't `https` (plain
`http` works only on `localhost`, `127.0.0.1` and `[::1]`), or `embedKey` is
empty, only whitespace, or not a string. It also throws outside a browser, or
before `<body>` exists without a `container`.

[Troubleshooting](https://docs.catenatelematics.com/get-started/connect-sdk/troubleshooting)
covers these and more. To embed the flow with no package, see
[Without the package](https://docs.catenatelematics.com/get-started/connect-sdk/without-the-package).

## Versioning and support

This package follows semver. A major release is the only one that removes or
changes something you rely on, and its changelog entry says how to migrate.
Anything deprecated keeps working for at least six months and at least one
minor release before a major removes it. The previous
major gets security fixes, and fixes for changes on the Catena side, for twelve
months after the next one is published.

The [full policy](https://docs.catenatelematics.com/get-started/connect-sdk/versioning)
says what it covers and what counts as breaking.

**Currently deprecated:** Nothing.

## License

[MIT](../../LICENSE)
