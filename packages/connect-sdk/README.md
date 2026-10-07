# @catenaclearing/connect-sdk

Embed SDK for Catena Connect. Connect fleet telematics to
[Catena](https://catenaclearing.io) from your own application.

One call renders the connection flow on your page and tells you how it ended.
The core package has no runtime dependencies.

- [What you need](#what-you-need)
- [Install](#install)
- [Quick start](#quick-start)
- [If the browser blocks the popup](#if-the-browser-blocks-the-popup)
- [Verify your integration](#verify-your-integration)
- [`open(options)`](#openoptions)
- [Events](#events)
- [The three modes](#the-three-modes)
- [Without the package](#without-the-package)
- [Troubleshooting](#troubleshooting)
- [Versioning and support](#versioning-and-support)

## What you need

- **An invitation URL.** The link on an invitation you create in the Catena
  dashboard or through the Catena API. The origin this package trusts is
  derived from it.
- **An embed key.** Issued by Catena. It is valid only for the origins
  registered against it, and the branding options apply only when it resolves.
- **A registered origin.** Every page that launches the flow must be on an
  origin registered against your embed key. You give Catena the origins and
  Catena registers them. Until an origin is registered, the flow does not
  render in an iframe on it. The surface offers the popup instead, where the
  flow runs but its messages never reach your page. Registered origins must
  be `https`, or `http` on `localhost`, and the scheme, host and port must
  match exactly: `www` and the apex are different origins.

You create invitations yourself, in the Catena dashboard or through the
Catena API. Catena issues the embed key and registers the origins you provide.

To also cover browsers that block popups, you need two pages on your own site
for the flow to come back to. See
[If the browser blocks the popup](#if-the-browser-blocks-the-popup).

## Install

> **Beta.** This package is in beta. Install it with the `@beta` tag. A plain
> `npm install @catenaclearing/connect-sdk` resolves to `0.0.2`, a skeleton
> that predates the flow, until the stable `1.0.0` is published.

```sh
npm install @catenaclearing/connect-sdk@beta
```

The package page is [npmjs.com/package/@catenaclearing/connect-sdk](https://www.npmjs.com/package/@catenaclearing/connect-sdk).
Copy the command from here or from that page rather than typing the name.
Look-alike names exist, and `@catenaclearing` is the only scope that is ours
([Official packages](#official-packages)).

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

That is the whole integration for most browsers. The flow renders in an
iframe on your page, or in a popup window where the browser will not allow the
iframe. `onClose` calls `destroy()` so the surface goes away when the flow is
done.

### When the user presses Done

Once a provider is connected, the flow shows a success screen with a button
that ends it. In the iframe the button reads **Done**. In a popup or a
redirected tab it reads **Return to** followed by your name as configured in
Catena. Pressing it calls `onSuccess` with the connections made in this
session, and then `onClose`.

The package does not remove the overlay, the iframe or the popup window on its
own. `destroy()` removes all of them. That is why the quick start calls
`destroy()` on the handle `open()` returns from `onClose`.

A user can also leave without pressing the button. Your connection webhooks
record every connection either way ([Events](#events)).

## If the browser blocks the popup

This section is optional. If a browser blocks both the iframe and the popup,
the flow takes over the browser tab your page is in: it navigates away from
your page and runs full-page. When the user finishes, the flow sends them to
the success or failure URL on your invitation (`success_redirect_url` and
`failure_redirect_url`), and your page's callbacks are gone.

The success URL means success only: the user arrives there with
`status=success` after a connection. The failure URL receives
`status=failure` when the user declines consent or disconnects, and
`status=integration-requested` when they request an integration or join a
waitlist, the same ending the iframe and popup modes report as `onExit`. The
flow also appends `skip_reason`, on a decline with a reason, and `tsp_count`.

To get the outcome on that path, host those two pages on the same origin as
the launching page, and call `resume()` on each one:

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

These are two separate call sites, not one call with `outcome` swapped
([`resume(options)`](#resumeoptions)).

If your invitation has no redirect URLs, the flow still completes on this path
and your webhooks still fire. Whether it succeeded or not, the user stays on
the flow's last screen, with no button back to your site.
[The three modes](#the-three-modes) explains when each mode is used.

## Verify your integration

1. The launching page's origin is registered against your embed key
   ([What you need](#what-you-need),
   [When you receive nothing](#when-you-receive-nothing)).
2. Popups are allowed on the launching page
   ([The three modes](#the-three-modes),
   [The provider window](#the-provider-window)).
3. The page's Content Security Policy allows the connect origin to be framed
   ([Troubleshooting](#troubleshooting)).
4. `onOpen` arrives on the launching page. It is the flow's own message, and
   it reaches a registered origin only, so it shows the origin is registered.
5. If you cover the redirect path, the success and failure pages are on the
   launching origin and call `resume()` with the right `outcome`
   ([If the browser blocks the popup](#if-the-browser-blocks-the-popup)).
6. Your connection webhooks are the record, and a callback is the prompt to
   check them ([Events](#events)).

## `open(options)`

| Option | Type | Required |
| --- | --- | --- |
| `inviteUrl` | `string` | yes |
| `embedKey` | `string` | yes |
| `container` | `HTMLElement` | no |
| `variant` | `"full" \| "card" \| string` | no |
| `theme` | `"light" \| "dark" \| string` | no |
| `logoUrl`, `logoUrlDark`, `brandColor` | `string` | no |
| `onOpen`, `onConnection`, `onSuccess`, `onExit`, `onClose` | callbacks | no |

Returns `{ destroy(): void }`.

### `inviteUrl`

The origin the package trusts is derived from this URL. That origin is used
for the iframe, the popup, and every inbound message check. The package has no
origin of its own, so pointing it at a development environment is just a
different invite URL. No separate build, no configuration.

The URL must be `https`, except on `localhost`, `127.0.0.1` and `[::1]`. Over
plain http on a shared network, anyone on that network can be the origin: they
can serve the flow, post a fake success, and read the embed key.

Pass only invite URLs you created, in the Catena dashboard or through the
Catena API, and hand them to the page from your own server. Never take one from
your page's query string, a form field, or anything else a visitor or another
site can set. Whoever chooses the URL chooses the origin the package trusts,
and can do the same three things.

`open()` throws a `TypeError` if the URL does not parse, is not http or
https, or is http on any host other than `localhost`, `127.0.0.1` or `[::1]`.
It also throws if it is called before `<body>` exists with no `container`, or
outside a browser.

### `container`

Pass an element to mount the flow inline. Omit it and the package renders its
own overlay. Behavior is otherwise identical, including on the fallback modes.
The package only removes what it created, so your container is left as it was
found.

### Presentation options

`variant`, `theme`, `brandColor`, `logoUrl` and `logoUrlDark` control how the
flow looks. All five are optional. Omit them and the flow renders with the
branding configured on your account.

```js
open({
  inviteUrl,
  embedKey,
  variant: "card",
  theme: "dark",
  brandColor: "#d1004b",
  logoUrl: "https://cdn.example.com/logo.svg",
  logoUrlDark: "https://cdn.example.com/logo-dark.svg",
  onSuccess: ({ connectionIds }) => continueYourFlow(connectionIds),
});
```

Each one is forwarded to the app as a query parameter on the launch URL,
exactly as you supplied it, and the app carries it across its own navigations
so the appearance holds for the whole flow. The app validates them, not this
package. An invalid value is ignored on its own: that one setting falls back
to its default, the others still apply, and the flow still renders.

The known values autocomplete, but a value your installed version has never
seen still compiles and is still sent. The app ignores values it does not
recognize and uses its default, so you do not need a package release to use a
new one.

#### `variant`

Which layout the flow renders.

- `"full"`, the default, is the flow as it renders on its own: a background,
  a navigation header carrying the logo, a theme toggle, help and Disconnect,
  and the connection card with the "Secure connection powered by Catena"
  attribution below it.
- `"card"` is the connection card alone, with the attribution moved inside
  it. It fills whatever it is mounted in edge to edge, so the card's own
  background is all you see: no page background behind it and no border or
  rounded corners of its own. The surface around it supplies the frame. The
  header goes with everything else, so there is no theme toggle and no
  Disconnect. Help moves into the card, at the top right of each screen. The
  logo still appears on the invite consent card, which
  opens an invited session in either variant.

The package's own overlay is a rounded panel of at most 460 by 720 pixels,
and `"card"` is the fit for it and for a `container` you have already styled.
The option rides on the launch URL, so it also applies when the flow falls
back to a popup or a redirect, where it has a whole tab. `"full"` suits that,
and a container with room for it.

A user who needs to disconnect a provider needs the header. Use `"full"`, or
send them to the flow outside your page.

#### `theme`

Forces the color scheme. `"light"` or `"dark"` overrides the user's stored
preference and the themes configured on your account, and the flow offers no
theme toggle while one is set. The forced value is not stored, so the user's
own preference is untouched on their next visit to the flow outside your page.

Omit it to leave the resolution alone: the user's stored preference, then
their device preference, then light.

There is no `"auto"`. The iframe is a separate document and cannot see your
page's theme. If you want the flow to match your surface, say which one you
are in. If you want it to follow the user's device, pass nothing.

#### `brandColor`

The flow's primary color, in both light and dark: the progress indicator and
the primary buttons. Six hex digits, with or without a leading `#`, so
`"d1004b"` and `"#d1004b"` are the same value. Text and icons drawn on the
color are derived to stay readable, so a near-white or near-black value still
produces legible buttons.

The progress indicator shows this color until the user has an active
connection, then switches to the flow's green success color. The buttons keep
the brand color throughout.

Anything else is ignored and the color configured on your account applies:
three-digit shorthand, eight digits with alpha, named colors, `rgb()` and
`hsl()`.

#### `logoUrl` and `logoUrlDark`

Replace your account's logo wherever the flow shows one: the navigation
header under `variant: "full"`, and the invite consent card that opens an
invited session under either variant. With `"card"` there is no header, so
the logo appears on the consent card alone.

Each is an absolute `https` URL on any host. `logoUrlDark` is shown in the
dark theme and falls back to `logoUrl` when omitted or invalid. Any other
scheme, a protocol-relative URL or a relative path is ignored.

The user's browser fetches the image directly from the host you name. It is
not proxied and not resized, though an oversized image is constrained to the
logo's slot. A URL that fails to load collapses the logo area rather than
showing a broken image or falling back to your account's logo.

#### Branding needs your embed key to resolve

`brandColor`, `logoUrl` and `logoUrlDark` are honored only when the launch's
embed key resolves to a registered, active key. With an unknown or revoked key
all three are ignored and the flow uses the branding configured on your
account. `variant` and `theme` need no key.

### `destroy()`

Removes everything the launch owns: its surface, the iframe or window it
opened, its message listener and its timers. It is idempotent and safe to call
after the flow has ended, so you can call it from a component teardown without
checking state first.

The one thing it leaves alone is a capability probe already in flight. The
probe belongs to the page, not to the launch (`preload()` runs one with no
launch at all). It cleans itself up within its own timeout, and its result is
kept so the next launch with the same embed key skips the loading state.

### One flow at a time

Calling `open()` while a launch is live focuses the existing surface and
returns that launch's handle. It does not start a second flow. In a
`container`, focusing the live surface does nothing visible.

Once a launch has ended (after `onSuccess`, `onExit` or `onClose`) and you
have not called `destroy()`, `open()` replaces it: the old launch gets
`onClose` if it has not had one, its surface is removed, and a new flow
starts with a new handle.

## Events

All five callbacks are optional. If you supply none, the flow still works and
you learn the outcome from your webhooks.

| Callback | Meaning | Payload |
| --- | --- | --- |
| `onOpen` | The flow is ready. It can arrive more than once. | none |
| `onConnection` | One provider was connected. The flow is still running. | `{ connectionId: string }` |
| `onSuccess` | The user finished and chose to come back to you. | `{ connectionIds: string[] }` |
| `onExit` | The flow ended without success. | `{ reason: string }` |
| `onClose` | The surface should be dismissed. | none |

`onSuccess` and `onExit` are mutually exclusive. Whichever arrives first is the
outcome. `onClose` follows either one. It arrives on its own in one case: in
the popup mode, when the user closes the popup window (the package checks
every half second). Nothing in the iframe mode produces it alone.

`onOpen` can arrive more than once, for example after the embedded page
reloads, so make the handler safe to run twice.

A launch has one ending. If you keep the surface up after `onSuccess` and the
user connects another provider, you get `onConnection` for it but no second
`onSuccess`. Call `open()` again if you want a fresh outcome.

### `onSuccess` means the user came back, not that a connection was made

It fires when the user presses the button on the success screen (**Done** in
the iframe, **Return to** followed by your name in a popup or tab), which
happens after the connection already exists. A user who connects and then
closes the surface, or just leaves the tab, never produces `onSuccess`, and
their connection is still real. Treat `onSuccess` as "they are done and
heading back
to you", and treat your connection webhooks as the record of what was actually
established. `connectionIds` is what this session saw, and is best effort for
the same reason.

### `onConnection` is the connection being made

It fires as each provider is connected, while the flow is still running. Do
not dismiss your surface on it; the user may be about to add another provider.
It exists mainly for the iframe mode, where the user is already looking at
your page and may never press the button that produces `onSuccess`. The same
`connectionId` can arrive twice if a user re-authorizes a provider twice in
one session. As with `connectionIds`, treat it as a prompt to check, and your
webhooks as the record.

`onOpen` and `onConnection` do not fire on every path. The redirect mode
(below) navigates away before the flow reports itself ready, and has no
channel to deliver either.

### The package never dismisses your surface

The package never removes anything on its own: not the overlay, not the
iframe, not the popup window. `onClose` means the flow is finished with the
surface. On `onClose`, call `destroy()` on the handle, or tear down your own
`container` or modal when it suits you. The overlay has no close button and
no Escape handling, so `destroy()` is the only way it goes away.

## The three modes

You do not choose a mode. The outcome (`onSuccess` or `onExit`) and `onClose`
arrive on all three, so one set of handlers covers every path. The exception
is the redirect mode: it navigates away from the page holding your callbacks,
and `resume()` delivers only the outcome you declare, followed by `onClose`.

1. **Iframe.** The surface renders immediately with a brief loading state
   while the package checks whether this browser will run the flow in an
   iframe. If it will, the iframe mounts in the surface. No warm-up call, no
   popup, no user gesture needed.
2. **Popup.** The flow needs a cookie in a cross-site context, and not every
   browser will send one. Where the iframe check fails, the surface shows a
   button instead, and clicking it opens the flow in a popup window. One
   extra click, on those browsers only.
3. **Redirect.** If the browser blocks the popup too, the flow navigates the
   browser tab your page is in to the connect origin and runs there,
   full-page. Your page and its callbacks are
   gone. If your invitation has a `success_redirect_url` and
   `failure_redirect_url`, the flow returns to one of them, and `resume()` on
   that page delivers the outcome. Without them the flow stays on its last
   screen, and your webhooks are the only record. The URLs are optional, and
   only the redirect path relies on them: the iframe and popup modes report
   the outcome by message. A popup whose launching page has closed or
   navigated away also falls back to them.

Popups must be allowed on the launching page, because your page opens the
popup-mode window.

The decision is made by measurement, not by a browser-version table. A hidden
iframe on the connect origin does a cookie round trip and reports whether the
cookie came back. Only a positive result mounts the iframe.

The redirect mode carries the launch across the navigation in
`sessionStorage`. If storage is disabled, full, or throws on access, there is
nothing for `resume()` to find, and it emits neither the outcome nor
`onClose`. The flow still completes and your webhooks still fire; only the
callbacks are lost. A launch is never held back because its record could not
be written.

## The provider window

Some providers (Samsara and Motive among them) sign the fleet in on
their own site, and that step cannot run inside an iframe. In the iframe and
popup modes, pressing Connect on one of those providers opens a second window
from the connect origin. The provider's login runs there, and the flow closes
the window once the connection is made. The surface you launched stays
where it is and shows the new connection.

That window belongs to the Catena app, not to this package and not to you. It
is opened from the user's click and closed when it is done. The provider's
pages never get a reference to your page; the window's opener is the Catena
document. You cannot observe it and do not need to. `onConnection` arrives
from the surface you launched, the same as for a provider that takes
credentials.

Two things to plan for:

- **Popups must be allowed on the launching page.** A kiosk or managed
  browser that blocks them everywhere leaves the user on a message saying the
  sign-in window was blocked, with the form intact to try again once the
  setting allows it. Nothing navigates and no callback fires.
- **This is not the popup mode.** The popup mode opens the whole flow in a
  window because the browser refused the iframe. The provider window opens
  inside a flow that is already running, and only for a provider that signs in
  on its own site.

## `resume(options)`

Only relevant to the redirect mode, and only when your invitation has redirect
URLs. Call it on the page the flow returns to.

```js
import { resume } from "@catenaclearing/connect-sdk";

// On your success page
resume({ outcome: "success", onSuccess: ({ connectionIds }) => {} });

// On your failure page
resume({ outcome: "exit", onExit: ({ reason }) => {} });
```

You have to state the outcome. The app signals success or failure by
navigating to the success or failure URL on your invitation. The package
is given your invite URL, not those destinations, so it cannot tell which page
it woke up on. You can.

The flow appends `status` (`success`, `failure` or `integration-requested`),
`skip_reason` on a decline with a reason, and `tsp_count` to the URL. The
failure page also receives integration requests, with
`status=integration-requested`, which matches `onExit` in the other modes
([If the browser blocks the popup](#if-the-browser-blocks-the-popup)).

These are two separate call sites, not one call with `outcome` swapped.
`resume()` calls `onExit` for `"exit"`, so copying the success form and
changing only `outcome` gives you a page that never receives a terminal
callback.

Both pages must be on the same origin as the page that called `open()`, or
`resume()` emits nothing.

It emits the terminal callback you declared (`onSuccess` for `"success"`,
`onExit` for `"exit"`), followed by `onClose`. Never `onOpen`: the flow
reported itself ready on a page the navigation already destroyed.

`resume()` always gives empty `connectionIds` and `reason`. Read the query
parameters on the page if you need them. Your connection webhooks are the
record, as they are on every path.

With no launch in flight, or an expired one, `resume()` does nothing, so it
can sit at the top of a destination page unconditionally.

## `preload(options)`

```js
import { preload } from "@catenaclearing/connect-sdk";

preload({ inviteUrl, embedKey });
```

Runs the iframe check early so the next `open()` chooses its mode with no
loading state. `embedKey` is optional. Pass the same key you will pass to
`open()` so the warmed check applies to the launch. Without it the check still
runs, but `open()` repeats it with the key.

It is an optimization, not a requirement. `open()` behaves the same whether or
not you call it; the only difference is a loading state about one network
round trip long.

It cannot break your page. An invite URL the package cannot derive an origin
from is ignored here. The same URL throws from `open()`, where a launch is at
stake.

The result is held for the life of the page and never persisted. Browser
settings change between visits, and a remembered "supported" would strand
someone in an iframe their browser no longer allows.

## When you receive nothing

Each of these is a real outcome, not an error to surface. Your connection
webhooks remain the record. The absence of a callback is never proof that
nothing happened.

1. **Unregistered origin.** The page you embed from is not registered against
   your embed key. The flow does not render in a frame, so the surface falls
   back to the popup. The flow runs there, but its messages are addressed
   elsewhere and the browser drops them. This is the origin check doing its
   job.
2. **Revoked or unresolvable embed key.** Deliberately indistinguishable from
   the above: the surface falls back to the popup, and the flow runs there
   with no origins to post to, so it sends nothing. You cannot tell them
   apart, and neither can an attacker.
3. **Severed opener.** Opening the flow through a link with `noopener` removes
   the channel the completion travels on. The user still finishes. The package
   never opens with `noopener`; this applies only to a window or link you open
   yourself.
4. **Redirect mode with no `resume()` call.** The flow completed in your tab
   and nothing was listening when it came back.
5. **A `resume()` destination on another origin.** The outcome crosses the
   navigation in a `sessionStorage` record, and that is partitioned by origin
   as well as by tab. Both destination pages must be on the same origin as the
   page that launched, or `resume()` emits nothing.
6. **The user abandoned the surface.** No terminal event was produced because
   the flow never reached one. In a frame, a user who connects and never
   presses **Done** produces `onConnection` but no `onSuccess`. The connection
   is real.

One caveat in the other direction: a callback means a redirected launch left
this tab recently, not that this page was reached from the flow. An abandoned
launch stays recorded for up to 30 minutes, and a `resume()` inside that
window will consume it. Put the call on your two destination pages and nowhere
else.

## Styling and isolation

The surface the package renders lives in a shadow root. Your global CSS cannot
restyle the overlay, and the overlay's CSS cannot leak into your page.

The package's own overlay is a modal dialog. It takes focus when it opens,
marks the rest of the document `inert` while it is up, and restores focus and
the tab order on teardown. Anything you had already marked `inert` stays that
way, so launching from inside your own modal gives your page back the way you
had it. Mounted into a `container` you supplied, it does none of this. Your
layout, your focus management.

## Without the package

Everything this package does goes through a URL and a message channel, so a
page can do it by hand. You set a few parameters on the invitation URL, open
it in a frame, a window or the current tab, and listen for the messages the
flow posts as it goes. What the package adds on top is the cookie probe and
the fallback to a window or a redirect, the one-launch-at-a-time guard, and
`resume()`. [What a plain integration gives
up](#what-a-plain-integration-gives-up) covers what you handle yourself
without them.

### The launch URL

| Parameter | Value | `open()` option | Note |
| --- | --- | --- | --- |
| `embed_key` | your embed key | `embedKey` | required |
| `embed` | `iframe`, `popup` or `redirect` | chosen by the package | required; must match how you open the URL |
| `variant` | `full` or `card` | `variant` | optional |
| `theme` | `light` or `dark` | `theme` | optional |
| `brand_color` | six hex digits | `brandColor` | optional; needs a resolving key |
| `brand_logo` | an `https` URL | `logoUrl` | optional; needs a resolving key |
| `brand_logo_dark` | an `https` URL | `logoUrlDark` | optional; needs a resolving key |

`embed` names the context the flow is opened in: `iframe` for a frame on your
page, `popup` for a window you open, `redirect` for the current tab. The flow
picks its session cookie attributes from it, so a value that does not match
the context is not cosmetic. A mismatched value breaks the session cookie or
the message channel. A frame sent `popup` or `redirect` gets a cookie the
browser may not send back from a frame, so the flow can fail partway; a
window sent `iframe` posts no messages.

Set the parameters on the invitation URL, which keeps whatever it already
carries, including the invitation itself (`?invite=…`, or `?tms_invite=…` for
a TMS invitation). The URL must be `https`, except on `localhost`,
`127.0.0.1` and `[::1]`, for the reasons [`inviteUrl`](#inviteurl) gives. The
flow ignores parameters it does not recognize.

`brand_color` accepts a leading `#`, but in a URL you write by hand it must be
encoded as `%23`. `URLSearchParams` does that for you.

[Presentation options](#presentation-options) describes what the five
optional parameters do, and the same rules hold here: the flow validates the
values, an invalid one falls back to its default on its own, and the three
branding parameters apply only when the embed key resolves.

### A plain iframe, link or window

The examples use `https://connect.example.com/?invite=YOUR_INVITE_ID` where
your invitation URL goes.

A frame on your page, with `embed=iframe`. A cross-origin frame is denied the
clipboard by default. Grant `clipboard-write`, which is what the package
grants, and nothing more. Do not add `sandbox`: the flow opens its own window
for some providers' sign-in, and a sandbox without `allow-popups` blocks it.

```html
<iframe
  src="https://connect.example.com/?invite=YOUR_INVITE_ID&embed_key=YOUR_EMBED_KEY&embed=iframe"
  title="Catena Connect"
  allow="clipboard-write"
></iframe>
```

A link, or a navigation, with `embed=redirect`. The flow runs in the tab. If
your invitation has a success and a failure URL, the flow returns to one of
them, and that is where you learn the outcome. Without them, the flow ends on
its last screen and your webhooks are the record:

```html
<a href="https://connect.example.com/?invite=YOUR_INVITE_ID&embed_key=YOUR_EMBED_KEY&embed=redirect">
  Connect your fleet
</a>
```

A window, with `embed=popup`, opened under the name `catena-connect` and
without `noopener`, which would sever the channel the messages travel on:

```js
const launchUrl =
  "https://connect.example.com/?invite=YOUR_INVITE_ID&embed_key=YOUR_EMBED_KEY";
let popup = null;

button.addEventListener("click", () => {
  // A second click brings the open window back instead of restarting the flow.
  if (popup !== null && !popup.closed) {
    popup.focus();
    return;
  }
  popup = window.open(`${launchUrl}&embed=popup`, "catena-connect");
  if (popup === null || popup.closed) {
    window.location.assign(`${launchUrl}&embed=redirect`);
  }
});
```

Call `window.open()` synchronously inside the click handler. An `await`
between the click and the call spends the activation, and the browser blocks
the window. It returns `null` when the browser refused, and some blockers hand
back a window that is already closed. The package treats both as refused and
navigates the tab with `embed=redirect`, and the example does the same.

Calling `window.open()` again with the name `catena-connect` lands on the
first window, but reloads it and restarts the flow. To bring an open window
back, check `popup.closed` and call `popup.focus()` instead.

With no listener at all, your connection webhooks tell you the outcome, and
on the redirect path so does the page the flow returns to, if your invitation
has redirect URLs. For many sites that is a complete integration.

### Reading the completion messages

A frame or a window posts a message to the page that opened it when the flow
is ready, as each provider is connected, and when the user finishes. Every
message has this shape, with the detail beside `event` and no
wrapper around it:

```ts
type CatenaConnectMessage = {
  source: "catena-connect";
  version: 1;
  event: "open" | "connection" | "success" | "exit" | "close";
  connectionId?: string;    // with "connection"
  connectionIds?: string[]; // with "success"
  reason?: string;          // with "exit"
};
```

The events mean what the [callbacks](#events) of the same name mean. The flow
posts `close` straight after `success` or `exit`, never on its own. A user who
closes your window produces nothing. If the surface stays up the user can
press the button again, and the outcome and `close` are posted again; the
package keeps only the first outcome, so a plain listener should too. `open`
can arrive more than once, for example after the frame reloads.

Check three things before you trust a message, on every message:

1. `event.origin` is the connect origin, the origin of your invitation URL.
2. `event.source` is the frame or window you opened.
3. `event.data.source` is `"catena-connect"`.

A listener that does exactly that:

```js
const connectOrigin = new URL(inviteUrl).origin;
const frame = document.querySelector("iframe");
// The outcome can be posted more than once. Act on the first one only.
let settled = false;

window.addEventListener("message", (event) => {
  if (event.origin !== connectOrigin) return;
  if (event.source !== frame.contentWindow) return;
  if (event.data?.source !== "catena-connect") return;

  switch (event.data.event) {
    case "open":
      flowIsReady();
      break;
    case "connection":
      noteConnection(event.data.connectionId);
      break;
    case "success":
      if (settled) break;
      settled = true;
      continueYourFlow(event.data.connectionIds);
      break;
    case "exit":
      if (settled) break;
      settled = true;
      offerRetry(event.data.reason);
      break;
    case "close":
      frame.remove();
      break;
  }
});
```

For a window, compare `event.source` with what `window.open()` returned. The
listener does not check `version`, for the same reason the package does not:
it handles the events it recognizes in any version, so a version bump cannot
silence it. Ignore events, versions and fields you do not recognize; additions arrive in minor
releases, and [Versioning and support](#versioning-and-support) says what is
promised to stay.

Which events arrive depends on how the URL was opened. A frame delivers all
five. A window delivers all five too, with one gap: a user who closes the
window posts nothing. The package polls the window's `closed` property every
half second to produce `onClose` there, and a plain integration that needs to
know does the same. A redirect delivers none: the tab has navigated away, and
the redirect URL it returns to, if the invitation has them, is the signal.

### What a plain integration gives up

- **No cookie probe and no fallback.** The package checks whether the browser
  will send the flow's cookie in a frame and falls back to a window or a
  redirect when it will not. A plain frame in a browser that refuses
  third-party cookies shows the flow failing to sign in instead. If you cannot
  vouch for the browsers, open a window with `embed=popup` or navigate the tab
  with `embed=redirect`.
- **No single-launch guard.** Two frames run two flows. Opening a window under
  the name `catena-connect` each time keeps a second `window.open()` on the
  first window, but restarts the flow in it.
- **No de-duplication of the outcome.** A second press of the button posts
  the outcome again, and your listener has to keep only the first.
- **No teardown of the window.** The package closes it on `destroy()`. A
  plain integration closes it itself.
- **No `resume()`.** Which destination page was reached says how the flow
  ended, and your webhooks carry the detail, as they do on the package's
  redirect path. Without a record written before the navigation, though, a
  destination page cannot tell a return from the flow apart from a direct
  visit.
- **No shadow-root surface.** You style and position the frame or the window,
  and you decide when to take it down.

Frame when you control the browsers, window when you do not, redirect when you
need nothing on the page at all. The three modes the package moves between are
all available to a plain integration by choosing the `embed` value and the
opening method yourself.

## Troubleshooting

Each entry starts with what you see on the page. The cause and the fix follow,
and the link at the end goes to the section that explains the mechanism.

**The surface shows "Continue" instead of the flow.** The package could not
confirm that this browser will run the flow in a frame. The causes:

- The launching page's origin is not registered against your embed key, or
  the key is unknown or revoked. The console shows a `frame-ancestors`
  violation. Register the exact origin: scheme, host and port must match, and
  `www` and the apex are different origins. Registered origins must be
  `https`, or `http` on `localhost` ([What you need](#what-you-need)).
- The browser refused the flow's cookie in a frame.
- Your page's Content Security Policy blocks the connect origin from being
  framed.
- The probe frame never answered in time: a blocked request, a frame that
  never loaded, a slow network.
- This page already probed once with no answer. That verdict is kept until
  the page reloads.

The flow still works through the button, which opens it in a window, or in
the tab when the browser blocks the window too (the next entry). On an
unregistered origin or with an unknown key, though, the window posts nothing
to your page. When the policy is the cause, allow the origin of your
invitation URL in `frame-src`, or in `child-src` if your policy has no
`frame-src`, or in `default-src` if it has neither. The cookie probe is a
frame on the same origin and falls under the same directive. The package
makes no requests of its own, so no other directive needs to change. A
refused cookie decides within one round trip; a frame that never answers,
including on an unregistered origin, waits out the budget, about two and a
half seconds, before the button appears. The policy case and an unregistered
origin show in the browser console as a violation report. A refused cookie or
an unanswered frame on a registered origin leaves nothing there
([The three modes](#the-three-modes)).

**Clicking "Continue" navigates the tab away.** The browser blocked the window
too, so the flow continued in the tab. This is the third mode, working as
designed. If your invitation has redirect URLs, make sure both pages call
`resume()`. Without them, the flow ends on its last screen and your webhooks
are the record ([The three modes](#the-three-modes),
[`resume(options)`](#resumeoptions)).

**A provider's sign-in window is blocked.** Popups must be allowed on the
launching page. The flow stays up with the form intact, and nothing fires
until the setting allows the window
([The provider window](#the-provider-window)).

**No callback ever arrives.** Most often the launching page's origin is not
registered against your embed key, or the key has been revoked, and the two
look the same from your page. The flow falls back to the popup and runs
there, but its messages are addressed elsewhere, or for an unknown or revoked
key not sent at all. The other causes: a window or link you opened yourself
with `noopener`, the flow ran in the tab and no page called `resume()`, the
destination page is on another origin, or the user left. Your webhooks are
the record in every case
([When you receive nothing](#when-you-receive-nothing)).

**`open()` throws.** The invitation URL does not parse, is not http or https,
or is http on a host other than `localhost`, `127.0.0.1` or `[::1]`. It also
throws when called before `<body>` exists with no `container`, or outside a
browser ([`inviteUrl`](#inviteurl)).

**`resume()` fires on a page the flow did not return to.** A redirected launch
left this tab within the last 30 minutes and was abandoned, and `resume()`
consumed its record. Call `resume()` on the two destination pages and nowhere
else ([`resume(options)`](#resumeoptions),
[When you receive nothing](#when-you-receive-nothing)).

**The flow renders but your branding is ignored.** The embed key does not
resolve to a registered, active key, so `brandColor`, `logoUrl` and
`logoUrlDark` are dropped and the branding configured on your account applies
([Branding needs your embed key to
resolve](#branding-needs-your-embed-key-to-resolve)). Or a value was rejected:
`brandColor` must be exactly six hex digits, and logo URLs must be absolute
`https`. A logo that fails to load leaves its slot empty. With
`variant: "card"` the logo shows only on the consent card.

**A second launch does nothing.** One flow runs at a time. The call focused
the live surface and returned its handle. In a `container`, that focus does
nothing visible ([One flow at a time](#one-flow-at-a-time)).

## Versioning and support

This package follows semver from `1.0.0`. The `1.0.0-beta.N` releases come
before it and carry no compatibility promise: a beta can change anything the
previous beta shipped, and the changelog says what changed. The promise below
starts with the stable `1.0.0`.

A major release removes or changes
something you rely on: dropping an option, renaming a callback, or changing
what a documented behavior does. A minor release adds: a new export, a new
option, a new event. A patch release fixes something without changing what
you call or what you receive.

### What the promise covers

- The documented exports, `open`, `resume` and `preload`, and their options,
  and the exported TypeScript types for the options, the handle and the event
  payloads.
- The five callbacks, `onOpen`, `onConnection`, `onSuccess`, `onExit` and
  `onClose`, and the fields of their payloads: `connectionId`,
  `connectionIds` and `reason`.
- The behavior this README documents and you can observe: one launch at a
  time, which callbacks arrive on which of the three modes, and that
  `onSuccess` and `onExit` never both arrive for one launch.
- For a page that reads the flow's completion messages directly, without this
  package: in a message whose `version` is `1`, the `source` marker
  `catena-connect`, the five event names `open`, `connection`, `success`,
  `exit` and `close`, and the field names that sit beside `event`:
  `connectionId`, `connectionIds` and `reason`.
- For a page that launches the flow from a URL it builds itself: the launch
  URL parameter names `embed`, `embed_key`, `variant`, `theme`, `brand_color`,
  `brand_logo` and `brand_logo_dark`, and the three `embed` values `iframe`,
  `popup` and `redirect`.

### What it does not cover

- The `0.0.x` releases. They were a typed skeleton with no runtime behavior,
  and their one export, `PACKAGE_NAME`, is not part of the API.
- The `@catenaclearing/connect-sdk/contract` entry point. It exists so the
  Catena app's own tests can check that what the app sends matches what this
  package reads. You should not need to import it, and it can change in a
  minor release.
- The appearance and content of the flow inside the surface. That is the
  Catena app, and it changes on its own schedule.
- Which of the three modes a given browser ends up in. The decision is made by
  measurement, and browsers change.
- The file layout under `dist`, the `sessionStorage` keys the redirect mode
  writes, and anything else you could only reach by inspecting internals.
- Query parameters already on your invite URL. The package writes its own
  (the embed key, the mode, and the presentation options you pass), replacing
  any of those already present, and leaves the rest as they are. What the app
  does with the rest is the app's to document. An option this package does
  not know is not forwarded, so a new app parameter arrives as a new option
  in a minor release.

### What counts as breaking

Any of these is a major release:

- Removing or renaming a covered export, option, callback or payload field.
- Narrowing an input that was accepted, such as rejecting a `container` that
  used to work.
- Changing a covered documented behavior, such as letting two launches run at
  once or delivering `onOpen` on the redirect path.
- A type change that makes consumer code that compiled before fail to compile.
- For the message contract: changing the `source` marker, an existing event
  name, or the name or position of an existing field, or renaming a launch
  URL parameter or one of the three `embed` values.

Additions are minor. A new export, a new option, a new optional field or a new
event does not break a correct integration. Ignore events and fields you do
not recognize.

### Deprecation

A covered surface that is going away is marked deprecated in a minor release
and keeps working for at least six months and at least one further minor
release before a major removes it. The removal's changelog entry carries a
migration note.

You hear about a deprecation in three places: the changelog entry for the
release that marks it, the list at the end of this section, and your editor,
because the type declarations carry the deprecation and name the replacement.
Install-time warnings from the registry are reserved for versions you should
not be running: one that has left support, carries a security problem, or has
a defect you have to move off. Deprecating a covered surface never shows up as
one.

**Currently deprecated:** Nothing.

### Support

- **The current major** receives features and fixes.
- **The previous major** receives security fixes, and fixes for breakage
  caused by changes on the Catena side, for twelve months after the next major
  is published. For that window the flow keeps posting the messages the
  previous major reads.
- **Older majors and the `0.0.x` releases** are unsupported.

A published version is never unpublished. A version with a defect is
superseded by a fixed one and, if you have to move off it, marked deprecated
on the registry with a pointer to the fix.

One exception to the deprecation window: a security fix that cannot ship
without a breaking change ships with the shortest notice possible, and is
announced in the changelog, in this section and in the type declarations at
once.

### How the policy is enforced

The maintainers of this repository check every changelog entry against this
section before a release is published. Automated checks in this repository
run on every change.

## Official packages

The only official Catena Clearing packages are published under the
`@catenaclearing` scope. There are two: this package,
[`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk),
and the React wrapper over it,
[`@catenaclearing/connect-sdk-react`](https://www.npmjs.com/package/@catenaclearing/connect-sdk-react).
Copy the name from the [Install](#install) command or from the package's npm
page. Packages under other scopes or unscoped names containing "catena" (for
example `@catena/sdk`, which belongs to an unrelated project) are not Catena
Clearing packages.

## License

[MIT](../../LICENSE)
