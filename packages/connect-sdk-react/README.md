# @catenaclearing/connect-sdk-react

React hooks and a component over
[`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk).
The flow is torn down when the component that launched it unmounts, and
handlers always come from your latest render. The full documentation is at
[docs.catenatelematics.com](https://docs.catenatelematics.com/get-started/connect-sdk/react).

## What you need

React 18 or 19, plus what the core needs: an invitation URL, an embed key, and
every launching page's origin registered against that key
([details](https://docs.catenatelematics.com/get-started/connect-sdk/overview)).

## Install

> **Beta.** Install with the `@beta` tag. A plain install resolves to
> `0.0.1`, a deprecated placeholder, until `1.0.0` is published.

```sh
npm install @catenaclearing/connect-sdk-react@beta
```

Copy the name from here or from
[npmjs.com/package/@catenaclearing/connect-sdk-react](https://www.npmjs.com/package/@catenaclearing/connect-sdk-react).
Look-alike packages exist. The only official ones are this package and
[`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk).

The core comes with it as a dependency. If you also install the core
directly, keep both on the same major. During the beta, that means:

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

Or render the flow inline with the component. Size the element and the flow
fills it:

```jsx
import { CatenaConnect } from "@catenaclearing/connect-sdk-react";

function ConnectPanel({ inviteUrl, embedKey }) {
  return (
    <CatenaConnect
      inviteUrl={inviteUrl}
      embedKey={embedKey}
      variant="card"
      style={{ width: "100%", height: 640 }}
      onSuccess={({ connectionIds }) => continueYourFlow(connectionIds)}
      onExit={({ reason }) => offerRetry(reason)}
    />
  );
}
```

The flow stays on the page after the user finishes it. With the hook,
call `destroy()` from `onClose`. With the component, unmount it.

### If the browser blocks the popup

If a browser blocks both the iframe and the popup, the flow takes over the
tab and returns to the success or failure URL on your invitation, if it has
them. (If your app runs inside a frame, the flow never takes over the tab.
The surface stays and asks the user to allow pop-ups.) Render a component on
each page that calls the resume hook:

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

## API

**`useCatenaConnect(options)`** returns `{ open, openWith, destroy }`, all
stable across renders. It takes the core's `open()` options, with a few
differences:

- `inviteUrl` can be `null` while you load it. `open()` throws until it's set.

- `container` is a ref, not an element.

- `preload` (default `true`) runs the core's iframe check while the component
  is mounted.

`open()` uses the options from the last completed render. If you fetch the
invitation in the click handler, pass it to `openWith({ inviteUrl })` instead,
since a value set in the same handler hasn't rendered yet.

**`<CatenaConnect />`** renders a `div` and launches into it on mount. It takes
the same options as props, minus `container` and `preload`, plus any `div`
prop except `children`, `dangerouslySetInnerHTML` and `ref`. Changing options
doesn't touch a live flow. Change `key` to relaunch.

**`useCatenaConnectResume(options)`** is the core's `resume()` as a hook. Use it
only on your two redirect pages.

The package is safe to render on the server, and the flow mounts after
hydration. Each file is marked `"use client"`, but you need your own client
component to pass handlers.

The [React guide](https://docs.catenatelematics.com/get-started/connect-sdk/react)
covers each export in full, plus troubleshooting. Events are the core's,
delivered unchanged
([Events and outcomes](https://docs.catenatelematics.com/get-started/connect-sdk/events)).

## Versioning and support

This package follows the core's
[versioning and support policy](https://docs.catenatelematics.com/get-started/connect-sdk/versioning):
semver from `1.0.0`, with no promise across the `1.0.0-beta.N` releases
before it.

**Currently deprecated:** Nothing.

## License

[MIT](../../LICENSE)
