import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConnectCallbacks,
  ConnectCloseEvent,
  ConnectConnectionDeletedEvent,
  ConnectConnectionEvent,
  ConnectExitEvent,
  ConnectOpenEvent,
  ConnectSuccessEvent,
} from "./index";
import * as sdk from "./index";

const inviteUrl = "https://connect.example.com/invite/abc123";
const embedKey = "pk_test_key";
const ORIGIN = "https://connect.example.com";

/** Every handle a test opened, torn down so the module slot starts clean. */
const handles: sdk.CatenaConnectHandle[] = [];

function launch(
  options: Partial<sdk.CatenaConnectOptions> = {}
): sdk.CatenaConnectHandle {
  const handle = sdk.open({ inviteUrl, embedKey, ...options });
  handles.push(handle);
  return handle;
}

/** The elements the package appended — identified by their shadow root. */
function surfacesIn(parent: ParentNode): Element[] {
  return [...parent.children].filter((child) => child.shadowRoot !== null);
}

/**
 * Dispatch a message as the browser would. `source` is assigned rather than
 * passed to the constructor because jsdom will not accept an arbitrary object
 * as a `WindowProxy` in `MessageEventInit`.
 */
function deliver(data: unknown, source: Window | null): void {
  const event = new MessageEvent("message", { data, origin: ORIGIN });
  Object.defineProperty(event, "source", { value: source, configurable: true });
  window.dispatchEvent(event);
}

afterEach(() => {
  while (handles.length > 0) handles.pop()?.destroy();
  document.body.replaceChildren();
});

describe("connect-sdk public surface", () => {
  it("exports open, resume and preload", () => {
    expect(typeof sdk.open).toBe("function");
    expect(typeof sdk.resume).toBe("function");
    expect(typeof sdk.preload).toBe("function");
  });

  it("exports nothing else", () => {
    expect(Object.keys(sdk).sort()).toEqual(["open", "preload", "resume"]);
  });

  it("exports the payload type of each of the six callbacks", () => {
    // Checked by `pnpm tsc` rather than the runner: a type the entry point
    // does not export fails the import. `ConnectConnectionEvent` was once
    // defined but left off the list, so a caller could receive an
    // `onConnection` payload but never name it.
    const callbacks: Required<ConnectCallbacks> = {
      onOpen: (event: ConnectOpenEvent) => event,
      onConnection: (event: ConnectConnectionEvent) => event.connectionId,
      onConnectionDeleted: (event: ConnectConnectionDeletedEvent) =>
        event.connectionId,
      onSuccess: (event: ConnectSuccessEvent) => event.connectionIds,
      onExit: (event: ConnectExitEvent) => event.reason,
      onClose: (event: ConnectCloseEvent) => event,
    };

    expect(Object.keys(callbacks)).toHaveLength(6);
  });
});

describe("open", () => {
  it("returns a handle carrying destroy", () => {
    const handle = launch();

    expect(typeof handle.destroy).toBe("function");
  });

  it("renders a surface immediately, behind a loading state", () => {
    launch();

    const [host] = surfacesIn(document.body);
    expect(host).toBeDefined();
    expect(host.shadowRoot?.textContent).not.toBe("");
  });

  it("renders into the caller's container when one is supplied", () => {
    const container = document.createElement("section");
    document.body.append(container);

    launch({ container });

    expect(surfacesIn(container)).toHaveLength(1);
    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("throws on an invite URL it cannot derive an origin from", () => {
    // Failing here is better than launching at an origin we invented.
    expect(() => sdk.open({ inviteUrl: "not-a-url", embedKey })).toThrow();
  });

  it("throws on an invite URL whose origin is opaque", () => {
    // `about:blank` parses, so this reaches further in than the case above.
    // Its origin is the string "null", which is what every opaque context
    // reports — trusting it would leave the origin guard unable to tell them
    // apart.
    expect(() => sdk.open({ inviteUrl: "about:blank", embedKey })).toThrow();
    expect(surfacesIn(document.body)).toHaveLength(0);
  });
});

describe("one flow at a time", () => {
  it("returns the first handle when a launch is already live", () => {
    const first = launch();
    const second = launch();

    expect(second).toBe(first);
  });

  it("starts no second flow", () => {
    launch();
    launch();

    expect(surfacesIn(document.body)).toHaveLength(1);
  });

  it("does not move focus in the host page when mounted inline", () => {
    // A user clicking the launch button twice. The first launch left their
    // page's focus alone; the second must not quietly do otherwise.
    const container = document.createElement("section");
    const trigger = document.createElement("button");
    document.body.append(container, trigger);
    launch({ container });
    trigger.focus();

    launch({ container });

    expect(document.activeElement).toBe(trigger);
  });

  it("brings its own overlay back to the user when they relaunch", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    launch();
    trigger.focus();

    launch();

    expect(document.activeElement).not.toBe(trigger);
  });

  it("starts a fresh launch once the first has been torn down", () => {
    const first = launch();
    first.destroy();

    const second = launch();

    expect(second).not.toBe(first);
    expect(surfacesIn(document.body)).toHaveLength(1);
  });
});

describe("destroy", () => {
  it("removes the surface", () => {
    const handle = launch();

    handle.destroy();

    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("is safe to call more than once", () => {
    const handle = launch();

    expect(() => {
      handle.destroy();
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
  });

  it("removes the message listener", () => {
    // Asserted on the registration, not on a message failing to arrive. A
    // launch with no mode has no source window yet, so every message is
    // rejected on the source guard regardless — a silence assertion here
    // would pass whether or not the listener was ever removed.
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");

    const handle = launch();
    const registered = added.mock.calls.find(([type]) => type === "message");
    expect(registered).toBeDefined();

    handle.destroy();

    expect(removed).toHaveBeenCalledWith("message", registered?.[1]);

    added.mockRestore();
    removed.mockRestore();
  });

  it("leaves the caller's container standing, emptied", () => {
    const container = document.createElement("section");
    document.body.append(container);
    const handle = launch({ container });

    handle.destroy();

    expect(document.body.contains(container)).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it("does not clear a launch that replaced it", () => {
    const first = launch();
    first.destroy();
    const second = launch();

    // An older handle's teardown, arriving late from a component unmount.
    first.destroy();

    expect(surfacesIn(document.body)).toHaveLength(1);
    expect(launch()).toBe(second);
  });
});

describe("after the flow has ended", () => {
  /**
   * These deliver with a source the guard cannot accept, so they assert the
   * property that holds regardless: an untrusted message settles nothing and
   * the launch stays live. Trusted events are covered in `messages.test.ts`,
   * and their effect on the launch slot in `modes.test.ts`.
   */
  it("ignores a terminal event that fails the source guard", () => {
    const onSuccess = vi.fn();
    const first = launch({ onSuccess });

    deliver(
      { source: "catena-connect", event: "success", payload: {} },
      window
    );

    expect(onSuccess).not.toHaveBeenCalled();
    expect(launch()).toBe(first);
  });

  it("is safe to tear down after a message has already been handled", () => {
    const handle = launch({ onClose: vi.fn() });

    deliver({ source: "catena-connect", event: "close" }, window);

    expect(() => handle.destroy()).not.toThrow();
    expect(surfacesIn(document.body)).toHaveLength(0);
  });
});

describe("repeated launches", () => {
  it("leaves nothing behind across many launch-and-teardown cycles", () => {
    for (let i = 0; i < 25; i += 1) {
      sdk.open({ inviteUrl, embedKey }).destroy();
    }

    expect(document.body.childElementCount).toBe(0);
  });
});
