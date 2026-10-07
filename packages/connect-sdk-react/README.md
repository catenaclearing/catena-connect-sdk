# @catenaclearing/connect-sdk-react

A thin React layer over
[`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk).
It adds what a React component needs and nothing else: the flow is torn down
when the component that launched it unmounts, the handler that runs is the one
from your latest render, and the redirect return page is one hook. Nothing
about the flow is different. The options, the events and the three modes are
the core's, and the core README is where they are documented.

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
directly, keep the two on the same major: the wrapper hands every launch to
the core it was built against, and one copy of the core is what keeps one
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
element; the flow fills it:

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

Either way, the flow does not remove itself when the user presses **Done**.
With the hook, call the `destroy()` it returns from `onClose`, as above. The
component
does not expose `destroy()`, so take it down by unmounting it, for example by
clearing the state that renders it in `onClose`. The core README's
[When the user presses Done](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#when-the-user-presses-done)
section has the detail.

### If the browser blocks the popup

This part is optional. If a browser blocks both the iframe and the popup, the
flow takes over the browser tab your app is in. When the user finishes, it
returns to the success or failure URL on your invitation, if the invitation
has them. Without them the flow stays on its last screen, there is no page
for the hook to run on, and your webhooks are the only record. To get the
outcome when the URLs are set, render a component at each one that calls the
resume hook:

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
checklist applies unchanged.

## `useCatenaConnect(options)`

Returns `{ open, destroy }`. Both functions are stable across renders, so they
can go straight into an `onClick` or a dependency list.

| Option | Type | Required |
| --- | --- | --- |
| `inviteUrl` | `string \| null \| undefined` | yes, to launch |
| `embedKey` | `string` | yes |
| `container` | `RefObject<HTMLElement \| null>` | no |
| `preload` | `boolean` | no, default `true` |
| `variant` | `"full" \| "card" \| string` | no |
| `theme` | `"light" \| "dark" \| string` | no |
| `logoUrl`, `logoUrlDark`, `brandColor` | `string` | no |
| `onOpen`, `onConnection`, `onSuccess`, `onExit`, `onClose` | callbacks | no |

Every option other than `inviteUrl`, `container` and `preload` is the core's,
with the core's meaning and default; the core README's
[`open(options)`](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#openoptions)
section is the reference. Those three differ for a component's life cycle:

- **`inviteUrl` may be absent while your application is still loading it.**
  `open()` throws until it is there. That is a programming error to fix, not
  a state to wait out: a button wired up before the invitation arrived.
- **`container` is a ref**, read when `open()` is called, so it can point at
  an element rendered by the same component. Omit it and the flow renders in
  the core's overlay.
- **`preload`** resolves the mode decision while the component is mounted, so
  the first launch opens straight into the flow instead of a loading state.
  It runs with the launch's embed key whenever `inviteUrl` or `embedKey`
  changes, never throws, and is an optimization
  only. Set `false` to leave the decision until `open()`.

**`open()`** launches the flow with the options as of your latest render, or
brings the live surface back if a launch is already up. One flow runs at a
time across the whole page, as in the core: a second `open()`, from this
component or any other, focuses the live surface and does not start another.
Once a launch has ended and you have not called `destroy()`, `open()`
replaces it with a new one, as the core's
[One flow at a time](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#one-flow-at-a-time)
section describes.

**`destroy()`** tears the current launch down: its surface, the frame or
window it opened, and its listeners. It is safe to call at any point,
including with nothing launched. You rarely need it. **Unmounting the
component does the same thing**, so a flow never outlives the component that
launched it, and a message arriving after unmount reaches no handler.

**Handlers follow the render.** The handler that runs is the one you passed
most recently, so a handler can close over current state without any ref of
your own, and changing a handler never relaunches.

**Launch options are fixed per launch.** Changing `inviteUrl`, `embedKey`,
`container` or a presentation option does not touch a live flow; the next
`open()` after the launch ends uses the new values. That is the core's
behavior, and the reason a launch cannot be edited from underneath the user.

Use one way in per page. The hook can tell its own launches apart, but not a
flow the core's own `open()` started, which is why the core's `open()`,
`resume()` and `preload()` are not re-exported here. A React page drives the
flow through this package alone.

## `<CatenaConnect />`

The hook on an element the component renders itself, for the case where the
flow is part of the page rather than a modal over it.

The props are the launch options above, minus `container` and `preload` (the
component is the container and launches as soon as it mounts), plus whatever a
`div` takes: `className`, `style`, `id`, `data-*` and ARIA attributes go onto
the element. `inviteUrl` is required. The element's contents belong to the
flow, so `children`, `dangerouslySetInnerHTML` and `ref` are not accepted.

It renders one `div` and launches the flow into it on mount. **Size that
element**, through `className` or `style`; the flow fills whatever it is
given. Unmounting tears the launch down and leaves the page as it was.

A launch is fixed for its lifetime, as above: changing `inviteUrl`,
`embedKey` or a presentation prop does not touch the flow on the page.
**Change `key` to relaunch** with new options. Handler props follow the render,
so a new `onSuccess` is the one that runs at the next delivery.

Under React's strict mode in development the first launch is torn down and a
second one started, as strict mode does with every effect. One surface is
visible either way.

## `useCatenaConnectResume(options)`

The core's `resume()` as a hook, for the redirect mode, and only useful when
your invitation has redirect URLs. Call it from the component rendered at
each of the two, with
`outcome: "success"` on one and `outcome: "exit"` on the other. The options
are the core's `resume()` options, unchanged; the core README's
[`resume(options)`](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#resumeoptions)
section says why the outcome is yours to declare and why these are two
separate call sites.

If a redirected launch went out from this tab in the last 30 minutes and
nothing has reported it yet, the matching handler runs once, followed by
`onClose`. Delivery is tied to mount, not to render, so re-renders deliver
nothing further, and under
strict mode the outcome is still delivered once: the core consumes the record
on the first call and the second finds nothing. The handler that runs is the
one from your most recent render. With no launch in flight the hook does
nothing, so it can sit in a destination page's component unconditionally.

The failure page also receives integration requests, with
`status=integration-requested` in its query parameters, the same ending the
iframe and popup modes report as `onExit`.

The core's caveats apply as written: `connectionIds` and `reason` are always
empty on this path (read the query parameters if you need them), both
destination pages must be on the launching origin, and a
callback means a redirected launch left this tab recently, not that this page
was reached from the flow. Keep the hook to your two destination pages and
nowhere else. The core README's
[When you receive nothing](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#when-you-receive-nothing)
section has the detail.

## Server rendering

The package is safe to import and render on the server. The hooks perform no
browser work there, and the component renders its empty `div`; the flow
mounts on the client after hydration. Every emitted JavaScript file begins
with `"use client"`, so a server-components application can render
`<CatenaConnect />` from a server tree without a wrapper file of its own, but
only with no handlers. Functions cannot cross from a server component to a
client one. To receive `onSuccess`, `onExit` or `onClose`, which you need to
unmount it after **Done**, render it from a `"use client"` component of your
own. Elsewhere the directive is inert.

## Events

The five callbacks, their payloads, and what each one does and does not mean
are the core's, and this package delivers them unchanged. Read the core
README's
[Events](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#events)
section, in particular what `onSuccess` does and does not mean: the user came
back, not that a connection was made. Your connection webhooks are the record.

## Troubleshooting

The entries below are the symptoms this package can cause on its own. For
everything about the flow itself, the surface showing a button instead of the
flow, a tab navigating away, a callback never arriving, the core README's
[Troubleshooting](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#troubleshooting)
section goes from the symptom to the fix, and
[The three modes](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#the-three-modes)
explains the mechanism.

**Two surfaces on the page.** Two components launched: two `<CatenaConnect />`
elements are mounted, or a component launched while another's flow was live.
One flow runs at a time, so the second launch focused the first surface; the
two elements are what you see. Render one.

**A handler sees stale state.** It should not: the handler that runs is the
one from the most recent render. If a handler closes over a value from an
earlier render, that is a bug in this package. File it, with the component
that shows it.

**Nothing happens on the server.** Expected. The flow mounts on the client;
server rendering produces the component's empty `div` and no browser work
([Server rendering](#server-rendering)).

**An overlay is left behind.** The component that launched the flow is still
mounted. A launch is torn down by its own component's unmount, or by its
`destroy()`; another component's unmount does not touch it. Unmount the one
that called `open()`, or call its `destroy()`.

**`open()` throws mentioning `inviteUrl`.** The hook was asked to launch
before the invitation URL arrived. Disable the button, or do not call
`open()`, until `inviteUrl` is a string. Every other throw is the core's,
usually an invitation URL that is not `https`.

## Versioning and support

This package follows the core's policy as written in its
[Versioning and support](https://github.com/catenaclearing/catena-connect-sdk/blob/main/packages/connect-sdk/README.md#versioning-and-support)
section: semver from `1.0.0`, with no compatibility promise across the
`1.0.0-beta.N` releases before it, the same definitions of major, minor and patch,
the same deprecation notice and the same support windows. It has no policy of
its own.

What the promise covers here: the three exports, `useCatenaConnect`,
`CatenaConnect` and `useCatenaConnectResume`; their options and props; the
exported types, `CatenaConnectProps`, `UseCatenaConnectOptions`,
`UseCatenaConnectResult`, `UseCatenaConnectResumeOptions`, and the core types
it re-exports; and the behavior this README documents and you can observe:
teardown on unmount, handlers following the render, options fixed per launch,
delivery once on the return page.

What it does not cover: anything about the flow, which is the core's promise
and the Catena app's; the core's internals; and the `0.0.x` versions. They
were published only to reserve the package name, are deprecated on the
registry, depend on a core release that predates the flow, and do not work.
They are unsupported. Install the
beta, or `1.0.0` or later once it is published.

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
