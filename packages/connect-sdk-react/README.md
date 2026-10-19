# @catenaclearing/connect-sdk-react

A thin React layer over
[`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk).
It tears the flow down when the component that launched it unmounts, runs the
handler from your latest render, and gives the redirect return page a single
hook. The flow itself works as it does in the core. The options, the events
and the three modes come from the core and are documented in the core README.

- [What you need](#what-you-need)

- [Install](#install)

- [Quick start](#quick-start)

- [`useCatenaConnect(options)`](#usecatenaconnectoptions)

- [`<CatenaConnect />`](#catenaconnect-)

- [`useCatenaConnectResume(options)`](#usecatenaconnectresumeoptions)

- [Server rendering](#server-rendering)

- [Events](#events)

- [Troubleshooting](#troubleshooting)

- [Versioning and support](#versioning-and-support)

## What you need

The same things the core needs: an invitation URL, an embed key, and the
origin of every launching page registered against that key. The core README's
[What you need](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#what-you-need)
section says where each comes from.

React 18 or 19.

## Install

> **Beta.** This package is in beta. Install it with the `@beta` tag. A plain
> `npm install @catenaclearing/connect-sdk-react` resolves to `0.0.1`, a
> deprecated placeholder, until the stable `1.0.0` is published.

```sh
npm install @catenaclearing/connect-sdk-react@beta
```

The package page is [npmjs.com/package/@catenaclearing/connect-sdk-react](https://www.npmjs.com/package/@catenaclearing/connect-sdk-react).
Copy the command from here or from that page rather than typing the name.
Look-alike names exist, and `@catenaclearing` is the only scope that is ours
([Official packages](#official-packages)).

The core comes with it as a dependency, so this is the only package a React
application has to install. If your application also installs the core
directly, keep the two on the same major. The wrapper hands every launch to
the core it was built against, and only a single copy of the core can keep one
flow running at a time. During the beta, that means installing the core with
`@beta` too:

```sh
npm install @catenaclearing/connect-sdk@beta
```

## Quick start

Launch from a button with the hook:

```jsx
import { useCatenaConnect } from "@catenaclearing/connect-sdk-react";

function ConnectButton({ inviteUrl, embedKey }) {
  const { open, destroy } = useCatenaConnect({
    inviteUrl,
    embedKey,
    onSuccess: ({ connectionIds }) => continueYourFlow(connectionIds),
    onExit: ({ reason }) => offerRetry(reason),
    onClose: () => destroy(),
  });

  return <button onClick={open}>Connect your fleet</button>;
}
```

Or render the flow inline, as part of the page, with the component. Size the
element and the flow fills it:

```jsx
import { CatenaConnect } from "@catenaclearing/connect-sdk-react";

function ConnectPanel({ inviteUrl, embedKey }) {
  return (
    <CatenaConnect
      inviteUrl={inviteUrl}
      embedKey={embedKey}
      variant="card"
      className="connect-panel"
      style={{ width: "100%", height: 640 }}
      onSuccess={({ connectionIds }) => continueYourFlow(connectionIds)}
      onExit={({ reason }) => offerRetry(reason)}
    />
  );
}
```

With the hook and with the component, the flow stays on the page after the
user presses **Done**. With the hook, call the `destroy()` it returns from
`onClose`, as above. The component does not expose `destroy()`, so take it
down by unmounting it, for example by clearing the state that renders it in
`onClose`. The core README's
[When the user presses Done](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#when-the-user-presses-done)
section has the detail.

### If the browser blocks the popup

This part is optional. If a browser blocks both the iframe and the popup, the
flow takes over the browser tab your app is in. When the user finishes, it
returns to the success or failure URL on your invitation, if the invitation
has them. Without them the flow stays on its last screen, there is no page
for the hook to run on, and only your webhooks record what was connected. To get
the outcome when the URLs are set, render a component at each one that calls
the resume hook:

```jsx
import { useCatenaConnectResume } from "@catenaclearing/connect-sdk-react";

// On your success page
function ConnectSucceeded() {
  useCatenaConnectResume({
    outcome: "success",
    onSuccess: ({ connectionIds }) => continueYourFlow(connectionIds),
  });
  return <p>Connected.</p>;
}

// On your failure page
function ConnectFailed() {
  useCatenaConnectResume({
    outcome: "exit",
    onExit: ({ reason }) => offerRetry(reason),
  });
  return <p>Something went wrong.</p>;
}
```

The core README's
[If the browser blocks the popup](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#if-the-browser-blocks-the-popup)
section says what happens without these pages, and its
[Verify your integration](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#verify-your-integration)
checklist applies to React pages too.

## `useCatenaConnect(options)`

Returns `{ open, openWith, destroy }`. All three are stable across renders, so
they can go straight into an `onClick` or a dependency list.

| Option | Type | Required |
| --- | --- | --- |
| `inviteUrl` | `string \| null \| undefined` | yes, to launch |
| `embedKey` | `string` | yes |
| `container` | `RefObject<HTMLElement \| null>` | no |
| `preload` | `boolean` | no, default `true` |
| `variant` | `"full" \| "card" \| string` | no |
| `theme` | `"light" \| "dark" \| string` | no |
| `logoUrl`, `logoUrlDark`, `brandColor`, `brandSecondary` | `string` | no |
| `onOpen`, `onConnection`, `onConnectionDeleted`, `onSuccess`, `onExit`, `onClose` | callbacks | no |

Every option other than `inviteUrl`, `container` and `preload` works as it
does in the core, with the same meaning and default. The core README's
[`open(options)`](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#openoptions)
section is the reference. These three behave differently because a component
mounts and unmounts.

**`inviteUrl` may be absent while your application is still loading it.**
`open()` throws until it is there. Calling it before then is a bug in the
page, usually a button wired up before the invitation arrived. Fix the page
rather than waiting for the error to go away.
When it does arrive, it should come from your own server, never from the
page's URL or other input a visitor controls. The core README's
[`inviteUrl`](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#inviteurl)
section says why.

**`container` is a ref**, read when `open()` is called, so it can point at
an element rendered by the same component. Omit it and the flow renders in
the core's overlay. Pass it and `open()` throws if the ref is not attached
to an element yet. It does not fall back to the overlay. This usually means
the element is rendered on a condition you set in the same handler, so it has
not rendered yet.

**`preload`** resolves the mode decision while the component is mounted, so
the first launch starts loading the flow without waiting on that check.
It runs with the launch's embed key whenever `inviteUrl` or `embedKey`
changes and never throws. Launches work without it. Set `false` to leave the
decision until `open()`.

**`open()`** launches the flow with the options as of your latest render, or
brings the live surface back if a launch is already up. As in the core, only
one flow runs on the page at a time. A second `open()`, from this component or
any other, focuses the live surface and does not start another.
Once a launch has ended and you have not called `destroy()`, `open()`
replaces it with a new one, as the core's
[One flow at a time](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#one-flow-at-a-time)
section describes.

`open()` reads the options from the last completed render. A value you set in
the same event handler has not rendered yet, so `open()` cannot see it. If you
fetch the invitation when the button is pressed, `setInviteUrl(url); open();`
launches the previous `inviteUrl`. That is the previous invitation if there
was one, and `open()` throws if there was none. Pass the new value to
`openWith()` instead.

**`openWith(options)`** is `open()` with some options supplied for this launch
in place of the rendered ones. It takes `inviteUrl`, `embedKey`, `container`
and the presentation options. Handlers always come from the latest render.
An option you pass replaces the rendered value, and an option you leave out
keeps it. Passing `undefined` clears an optional one, such as `theme`. For
`inviteUrl` it makes `openWith()` throw, as `open()` does.

```tsx
const { openWith } = useCatenaConnect({ inviteUrl: null, embedKey });

async function connect() {
  const inviteUrl = await fetchInviteUrl();
  openWith({ inviteUrl });
}

return <button onClick={connect}>Connect your fleet</button>;
```

`open()` takes no argument so that `onClick={open}` keeps working. React
passes the click event to the `onClick` handler, which is why `openWith()` is
a separate function. If you can, fetch the invitation before the button is
shown. That page is simpler, because the button can be disabled until the
invitation arrives and `preload` can warm the launch.

**`destroy()`** tears the current launch down: its surface, the frame or
window it opened, and its listeners. You can call it at any time, even with
nothing launched. Outside `onClose`, you rarely need it. **Unmounting the
component does the same thing**, so a flow is gone once the component that
launched it unmounts, and a message arriving after unmount reaches no handler.

**Handlers follow the render.** The handler that runs is the one you passed
most recently, so a handler can close over current state without any ref of
your own, and changing a handler never relaunches.

**Launch options are fixed per launch.** Changing `inviteUrl`, `embedKey`,
`container` or a presentation option does not touch a live flow. The next
`open()` after the launch ends uses the new values. The core behaves the same
way, so the flow never changes under the user partway through a launch.

On a React page, launch the flow only through this package. The hook can tell
its own launches apart, but not a flow started by the core's `open()`. That is
why the core's `open()`, `resume()` and `preload()` are not re-exported here.

## `<CatenaConnect />`

The hook on an element the component renders itself, for showing the flow
inside the page instead of as a modal over it.

The props are the launch options above, minus `container` and `preload` (the
component is the container and launches as soon as it mounts), plus any prop
a `div` takes: `className`, `style`, `id`, `data-*` and ARIA attributes go
onto the element. `inviteUrl` is required. The flow manages the element's
contents, so `children`, `dangerouslySetInnerHTML` and `ref` are not accepted.

It renders one `div` and launches the flow into it on mount. **Size that
element**, through `className` or `style`, and the flow fills it. Unmounting
tears the launch down and leaves the page as it was.

Because the launch happens in a mount effect, an `inviteUrl` or `embedKey`
the core refuses throws from that effect to your nearest error boundary, and
without one React unmounts the tree. The core refuses a URL that does not
parse, is not `http` or `https`, or is `http` on a host other than
`localhost`, `127.0.0.1` or `[::1]`, and an embed key that is not a non-empty
string.
Render the component only once you have the invitation URL you were issued
and your embed key.

A launch is fixed for its lifetime, as above. Changing `inviteUrl`,
`embedKey` or a presentation prop does not touch the flow on the page.
**Change `key` to relaunch** with new options. Handler props follow the render,
so a new `onSuccess` is the one that runs at the next delivery.

Under React's strict mode in development the first launch is torn down and a
second one started, as strict mode does with every effect. You still see only
one surface.

## `useCatenaConnectResume(options)`

The core's `resume()` as a hook, for the redirect mode, and only useful when
your invitation has redirect URLs. Call it from the component rendered at
each of the two, with
`outcome: "success"` on one and `outcome: "exit"` on the other. The options
are the core's `resume()` options, unchanged. The core README's
[`resume(options)`](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#resumeoptions)
section explains why you declare the outcome yourself and why these are two
separate call sites.

If a redirected launch went out from this tab in the last 30 minutes and
nothing has reported it yet, the matching handler runs once, followed by
`onClose`. Delivery is tied to mount, not to render, so re-renders deliver
nothing further. Under strict mode the outcome is still delivered once,
because the core consumes the record on the first call and the second finds
nothing. If a handler throws, your component stays mounted. The hook rethrows
the exception in a separate task, so it reaches the console and
`window.onerror` the same way a throw from a handler in the other two modes
does. The handler that runs is the one from your most recent render. With no
launch in flight the hook does nothing, so you can call it unconditionally in
a destination page's component.

The failure page also receives integration requests, with
`status=integration-requested` in its query parameters, the same ending the
iframe and popup modes report as `onExit`.

The core's caveats apply as written: `connectionIds` is always empty on this
path, `reason` comes from the failure URL's `skip_reason` or `status`, both
destination pages must be on the launching origin, and a
callback means a redirected launch left this tab recently, not that this page
was reached from the flow. Use the hook only on your two destination pages.
The core README's
[When you receive nothing](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#when-you-receive-nothing)
section has the detail.

## Server rendering

The package is safe to import and render on the server. The hooks perform no
browser work there, and the component renders its empty `div`. The flow
mounts on the client after hydration. Every emitted JavaScript file begins
with `"use client"`, so a server-components application can render
`<CatenaConnect />` from a server tree without a separate wrapper file, but
only with no handlers. Functions cannot cross from a server component to a
client one. To receive `onSuccess`, `onExit` or `onClose`, which you need to
unmount it after **Done**, render it from a `"use client"` component of your
own. Elsewhere the directive is inert.

## Events

The six callbacks and their payloads come from the core, and this package
delivers them unchanged. Read the core README's
[Events](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#events)
section, in particular what `onSuccess` does and does not mean: the user came
back, not that a connection was made. Use your connection webhooks to confirm
a connection.

## Troubleshooting

The entries below cover symptoms specific to this package. For problems with
the flow itself, such as the surface showing a button instead of the flow, a
tab navigating away, or a callback that never arrives, the core README's
[Troubleshooting](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#troubleshooting)
section goes from the symptom to the fix, and
[The three modes](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#the-three-modes)
explains the mechanism.

**Two surfaces on the page.** Two components launched: two `<CatenaConnect />`
elements are mounted, or a component launched while another's flow was live.
Only one flow runs at a time, so the second launch focused the first surface,
and what you see is the two elements. Render one.

**A handler sees stale state.** The handler that runs is the one from the most
recent render. If a handler closes over a value from an earlier render, that
is a bug in this package. File it, with the component that shows it.

**Nothing happens on the server.** This is expected. The flow mounts on the
client. Server rendering produces the component's empty `div` and no browser
work ([Server rendering](#server-rendering)).

**An overlay is left behind.** The component that launched the flow is still
mounted. A launch is torn down by its own component's unmount, or by its
`destroy()`. Another component's unmount does not touch it. Unmount the one
that called `open()`, or call its `destroy()`.

**`open()` throws mentioning `inviteUrl`.** The hook was asked to launch
before the invitation URL arrived. Disable the button, or do not call
`open()`, until `inviteUrl` is a string. If you set the URL in the same
handler that calls `open()`, it has not rendered yet, so use `openWith()`
([`useCatenaConnect(options)`](#usecatenaconnectoptions)).

**`open()` throws mentioning `container`.** You passed a ref that is not
attached to an element when `open()` runs, usually because the element is
rendered on a condition set in the same handler. Render the element
unconditionally and hide it, or launch from an effect once it has rendered.

**The flow opens an earlier invitation.** This has the same cause. `open()`
ran in the handler that set a new `inviteUrl`, so it launched the one from the
latest render. Pass the new URL to `openWith()`. Any other throw comes from the
core, usually an invitation URL that is `http` on a host other than
`localhost`, `127.0.0.1` or `[::1]`, or an empty `embedKey` read from an
environment variable that is not set.

## Versioning and support

This package follows the core's policy as written in its
[Versioning and support](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#versioning-and-support)
section: semver from `1.0.0`, with no compatibility promise across the
`1.0.0-beta.N` releases before it, the same definitions of major, minor and patch,
the same deprecation notice and the same support windows.

What the promise covers here: the three exports, `useCatenaConnect`,
`CatenaConnect` and `useCatenaConnectResume`; their options and props; the
exported types, `CatenaConnectProps`, `UseCatenaConnectOpenOptions`,
`UseCatenaConnectOptions`, `UseCatenaConnectResult`,
`UseCatenaConnectResumeOptions`, and the core types
it re-exports; and the behavior this README documents and you can observe:
teardown on unmount, handlers following the render, options fixed per launch,
delivery once on the return page.

What it does not cover: anything about the flow itself, which the core and the
Catena app cover; the core's internals; and the `0.0.x` versions. Those were
published only to reserve the package name, are deprecated on the registry,
depend on a core release that predates the flow, and do not work, so they are
not supported. Install the beta, or `1.0.0` or later once it is published.

**Currently deprecated:** Nothing.

## Official packages

The only official Catena Clearing packages are published under the
`@catenaclearing` scope. There are two:
[`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk),
the core, and this package,
[`@catenaclearing/connect-sdk-react`](https://www.npmjs.com/package/@catenaclearing/connect-sdk-react).
Copy the name from the [Install](#install) command or from that page. Packages
under other scopes or unscoped names containing "catena" (for example
`@catena/sdk`, which belongs to an unrelated project) are not Catena Clearing
packages.

## License

[MIT](../../LICENSE)
