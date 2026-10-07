import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompletionMessage } from "./contract";
import { type Listener, listen } from "./messages";
import type { ConnectCallbacks } from "./types";

const ORIGIN = "https://connect.example.com";

/**
 * The window this launch created. A plain object stands in for it: nothing
 * here dereferences it, and the guard is an identity comparison.
 */
function launchWindow(): Window {
  return {} as Window;
}

/**
 * Deliver a message as the browser would.
 *
 * `source` is assigned rather than passed to the constructor because jsdom
 * will not accept an arbitrary object as a `WindowProxy` in `MessageEventInit`.
 * The guard reads the property, so assigning it exercises the same path.
 *
 * Note what this does NOT prove: jsdom delivers a `postMessage` whatever its
 * target origin says, so a message arriving here only shows that our handler
 * ran. The addressing claims are verified in a real browser.
 */
function deliver(init: {
  origin?: string;
  source?: Window | null;
  data?: unknown;
}): void {
  const event = new MessageEvent("message", {
    data: init.data,
    origin: init.origin ?? ORIGIN,
  });
  Object.defineProperty(event, "source", {
    value: init.source === undefined ? null : init.source,
    configurable: true,
  });
  window.dispatchEvent(event);
}

/**
 * A well-formed envelope, which each guard test then spoils in one way.
 *
 * The detail is spread beside `event`, because that is the shape the app
 * posts. For a release this fixture nested it under `payload`, the parser
 * read it from there, and the suite was green against a message the app
 * never sends. The one test below built by hand against the app's own
 * document is the guard against this file agreeing with itself again.
 */
function envelope(event: string, detail?: Record<string, unknown>): unknown {
  return { source: "catena-connect", version: "1", event, ...detail };
}

const listeners: Listener[] = [];

function start(callbacks: ConnectCallbacks): { source: Window } {
  const source = launchWindow();
  listeners.push(listen({ origin: ORIGIN, source: () => source }, callbacks));
  return { source };
}

afterEach(() => {
  while (listeners.length > 0) listeners.pop()?.stop();
});

describe("the three guards", () => {
  it("delivers a message that satisfies all three — the control", () => {
    // Every silence assertion below is only meaningful because this passes.
    // Without it, a broken harness and a working guard look identical.
    const onOpen = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source }, { onOpen })
    );

    deliver({ source, data: envelope("open") });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("rejects a message from another origin", () => {
    const onOpen = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source }, { onOpen })
    );

    deliver({
      origin: "https://attacker.example.com",
      source,
      data: envelope("open"),
    });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("rejects a message from a window this launch did not create", () => {
    // The stale-launch case: right origin, right payload shape, wrong window.
    const onOpen = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source }, { onOpen })
    );

    deliver({ source: launchWindow(), data: envelope("open") });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("rejects a message whose payload does not identify itself as the app's", () => {
    const onOpen = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source }, { onOpen })
    );

    deliver({ source, data: { event: "open" } });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("rejects everything while the launch has no window yet", () => {
    const onOpen = vi.fn();
    listeners.push(listen({ origin: ORIGIN, source: () => null }, { onOpen }));

    deliver({ source: launchWindow(), data: envelope("open") });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("rejects a message carrying no data at all", () => {
    const onOpen = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source }, { onOpen })
    );

    deliver({ source });
    deliver({ source, data: "catena-connect" });

    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("mapping the contract onto the callbacks", () => {
  it("maps each of the five events to its callback", () => {
    const callbacks = {
      onOpen: vi.fn(),
      onConnection: vi.fn(),
      onSuccess: vi.fn(),
      onExit: vi.fn(),
      onClose: vi.fn(),
    };
    const { source } = start(callbacks);

    deliver({ source, data: envelope("open") });
    deliver({
      source,
      data: envelope("connection", { connectionId: "conn_1" }),
    });
    deliver({
      source,
      data: envelope("success", { connectionIds: ["conn_1", "conn_2"] }),
    });
    deliver({ source, data: envelope("close") });

    expect(callbacks.onOpen).toHaveBeenCalledWith({});
    expect(callbacks.onConnection).toHaveBeenCalledWith({
      connectionId: "conn_1",
    });
    expect(callbacks.onSuccess).toHaveBeenCalledWith({
      connectionIds: ["conn_1", "conn_2"],
    });
    expect(callbacks.onClose).toHaveBeenCalledWith({});
    expect(callbacks.onExit).not.toHaveBeenCalled();
  });

  // A connection does not settle the launch. The caller's surface stays up
  // and the outcome is still to come, so nothing here may mark it over.
  it("delivers a connection without ending the launch", () => {
    const onConnection = vi.fn();
    const onSuccess = vi.fn();
    const onTerminal = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen(
        { origin: ORIGIN, source: () => source, onTerminal },
        { onConnection, onSuccess }
      )
    );

    deliver({
      source,
      data: envelope("connection", { connectionId: "conn_1" }),
    });
    deliver({
      source,
      data: envelope("connection", { connectionId: "conn_2" }),
    });

    expect(onConnection).toHaveBeenCalledTimes(2);
    expect(onTerminal).not.toHaveBeenCalled();

    deliver({
      source,
      data: envelope("success", { connectionIds: ["conn_1", "conn_2"] }),
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("delivers a success carrying no identifiers as a success", () => {
    const onSuccess = vi.fn();
    const { source } = start({ onSuccess });

    deliver({ source, data: envelope("success", { connectionIds: [] }) });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: [] });
  });

  it("forwards a list of identifiers exactly as it arrived", () => {
    const onSuccess = vi.fn();
    const { source } = start({ onSuccess });

    deliver({
      source,
      data: envelope("success", { connectionIds: ["a", "b", "c"] }),
    });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: ["a", "b", "c"] });
  });

  it("delivers no identifiers rather than a partial list when one is not a string", () => {
    // A shorter list than the flow established, with no way for the caller
    // to know it was shortened, is worse than the contract's empty-list case.
    const onSuccess = vi.fn();
    const { source } = start({ onSuccess });

    deliver({
      source,
      data: envelope("success", { connectionIds: ["conn_1", 42] }),
    });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: [] });
  });

  it("delivers no identifiers when the payload carries something other than a list", () => {
    const onSuccess = vi.fn();
    const { source } = start({ onSuccess });

    deliver({ source, data: envelope("success", { connectionIds: "conn_1" }) });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: [] });
  });

  it("forwards the exit reason unchanged", () => {
    const onExit = vi.fn();
    const { source } = start({ onExit });

    deliver({ source, data: envelope("exit", { reason: "user_cancelled" }) });

    expect(onExit).toHaveBeenCalledWith({ reason: "user_cancelled" });
  });

  it("works when the caller supplied no callbacks at all", () => {
    const source = launchWindow();
    listeners.push(listen({ origin: ORIGIN, source: () => source }, {}));

    expect(() => {
      deliver({ source, data: envelope("open") });
      deliver({ source, data: envelope("success", { connectionIds: [] }) });
    }).not.toThrow();
  });
});

describe("tolerating what this version does not know", () => {
  it("ignores an unrecognized event name without erroring", () => {
    const callbacks = {
      onOpen: vi.fn(),
      onSuccess: vi.fn(),
      onExit: vi.fn(),
      onClose: vi.fn(),
    };
    const { source } = start(callbacks);

    expect(() => {
      deliver({ source, data: envelope("telemetry_sampled") });
    }).not.toThrow();

    // The control: a recognized event on the same listener still arrives.
    deliver({ source, data: envelope("open") });

    expect(callbacks.onOpen).toHaveBeenCalledTimes(1);
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(callbacks.onExit).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it("still delivers recognized events when the contract version is unrecognized", () => {
    const onSuccess = vi.fn();
    const { source } = start({ onSuccess });

    deliver({
      source,
      data: {
        source: "catena-connect",
        version: "99",
        event: "success",
        connectionIds: ["conn_1"],
      },
    });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: ["conn_1"] });
  });

  it("reads the shape the app actually posts, with nothing nested", () => {
    // Field for field what `buildCompletionMessage` returns in the connect
    // app and what its EMBED_COMPLETION.md tells a raw consumer to read,
    // numeric version included — written out rather than built with the
    // fixture, so a fixture that drifts cannot carry this test with it.
    //
    // `connectionIds` and `reason` sit beside `event`. The parser once read
    // them from a `payload` key the app never sends, and every success
    // arrived as an empty list and every exit as an empty reason, on every
    // environment and every provider, with this suite green throughout.
    const onSuccess = vi.fn();
    const success = start({ onSuccess });

    deliver({
      source: success.source,
      data: {
        source: "catena-connect",
        version: 1,
        event: "success",
        connectionIds: ["conn_1", "conn_2"],
      } satisfies CompletionMessage,
    });

    expect(onSuccess).toHaveBeenCalledWith({
      connectionIds: ["conn_1", "conn_2"],
    });

    const onExit = vi.fn();
    const exit = start({ onExit });

    deliver({
      source: exit.source,
      data: {
        source: "catena-connect",
        version: 1,
        event: "exit",
        reason: "user_cancelled",
      } satisfies CompletionMessage,
    });

    expect(onExit).toHaveBeenCalledWith({ reason: "user_cancelled" });
  });

  it("still delivers recognized events when no version is carried", () => {
    const onOpen = vi.fn();
    const { source } = start({ onOpen });

    deliver({ source, data: { source: "catena-connect", event: "open" } });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("terminal events", () => {
  it("treats success and exit as mutually exclusive, first one winning", () => {
    const callbacks = { onSuccess: vi.fn(), onExit: vi.fn() };
    const { source } = start(callbacks);

    deliver({ source, data: envelope("success", { connectionIds: ["c"] }) });
    deliver({ source, data: envelope("exit", { reason: "too_late" }) });

    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(callbacks.onExit).not.toHaveBeenCalled();
  });

  it("does not deliver a second success after the first", () => {
    const onSuccess = vi.fn();
    const { source } = start({ onSuccess });

    deliver({ source, data: envelope("success", { connectionIds: ["a"] }) });
    deliver({ source, data: envelope("success", { connectionIds: ["b"] }) });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: ["a"] });
  });

  it("still delivers the dismissal after a terminal event", () => {
    // Closed may follow either terminal event or arrive alone, so settling
    // must not gate it.
    const callbacks = { onExit: vi.fn(), onClose: vi.fn() };
    const { source } = start(callbacks);

    deliver({ source, data: envelope("exit", { reason: "abandoned" }) });
    deliver({ source, data: envelope("close") });

    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it("settles the launch before handing control to the caller", () => {
    // A callback may call back into the package. If the launch were still
    // live at that point it would hand back a finished launch's handle.
    const onTerminal = vi.fn();
    const source = launchWindow();
    let liveAtCallbackTime: number | null = null;
    listeners.push(
      listen(
        { origin: ORIGIN, source: () => source, onTerminal },
        {
          onSuccess: () => {
            liveAtCallbackTime = onTerminal.mock.calls.length;
          },
        }
      )
    );

    deliver({ source, data: envelope("success", { connectionIds: [] }) });

    expect(liveAtCallbackTime).toBe(1);
  });

  it("settles the launch even when the caller's callback throws", () => {
    // A throw inside an event listener does not come back to the code that
    // dispatched it — the browser reports it and carries on. So the package
    // never gets a chance to clean up afterwards, which is exactly why the
    // launch has to be settled before the callback is entered rather than
    // after it.
    const onTerminal = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen(
        { origin: ORIGIN, source: () => source, onTerminal },
        {
          onSuccess: () => {
            throw new Error("caller callback blew up");
          },
        }
      )
    );

    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", swallow);
    try {
      deliver({ source, data: envelope("success", { connectionIds: [] }) });
    } finally {
      window.removeEventListener("error", swallow);
    }

    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("treats a dismissal that arrives alone as the end of the launch", () => {
    // Close can arrive with no outcome before it. The flow is finished with
    // the surface either way, so the launch is no longer live.
    const onTerminal = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source, onTerminal }, {})
    );

    deliver({ source, data: envelope("close") });

    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("reports the flow is over once when a dismissal follows an outcome", () => {
    const onTerminal = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source, onTerminal }, {})
    );

    deliver({ source, data: envelope("success", { connectionIds: [] }) });
    deliver({ source, data: envelope("close") });

    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("still delivers an outcome that arrives after a dismissal", () => {
    // A close racing ahead of the outcome must not swallow it: only success
    // and exit say what happened.
    const onSuccess = vi.fn();
    const { source } = start({ onSuccess });

    deliver({ source, data: envelope("close") });
    deliver({ source, data: envelope("success", { connectionIds: ["c"] }) });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: ["c"] });
  });

  it("reports the flow is over exactly once", () => {
    const onTerminal = vi.fn();
    const source = launchWindow();
    listeners.push(
      listen({ origin: ORIGIN, source: () => source, onTerminal }, {})
    );

    deliver({ source, data: envelope("success", { connectionIds: [] }) });
    deliver({ source, data: envelope("exit", { reason: "x" }) });

    expect(onTerminal).toHaveBeenCalledTimes(1);
  });
});

describe("stopping", () => {
  it("delivers nothing once the listener has been removed", () => {
    const onOpen = vi.fn();
    const source = launchWindow();
    const listener = listen(
      { origin: ORIGIN, source: () => source },
      { onOpen }
    );

    // The control, before stopping.
    deliver({ source, data: envelope("open") });
    expect(onOpen).toHaveBeenCalledTimes(1);

    listener.stop();
    deliver({ source, data: envelope("open") });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("a dismissal the flow never sent", () => {
  // The user closing the popup posts nothing at all, so popup mode
  // synthesizes the dismissal rather than letting the launch hang on an
  // event that is never coming. It is routed back through the listener so
  // that both dismissals settle the same state.

  it("delivers the dismissal and reports the flow over", () => {
    const onClose = vi.fn();
    const onTerminal = vi.fn();
    const source = launchWindow();
    const listener = listen(
      { origin: ORIGIN, source: () => source, onTerminal },
      { onClose }
    );
    listeners.push(listener);

    listener.dismiss();

    expect(onClose).toHaveBeenCalledWith({});
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("does not double a dismissal the flow already sent", () => {
    const onClose = vi.fn();
    const source = launchWindow();
    const listener = listen(
      { origin: ORIGIN, source: () => source },
      {
        onClose,
      }
    );
    listeners.push(listener);

    // The app dismissed, and then the user closed the window it was done
    // with. One dismissal happened, so the caller hears about one.
    deliver({ source, data: envelope("close") });
    listener.dismiss();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still dismisses after an outcome that carried no dismissal", () => {
    // Success without a close is the shape that makes the watchdog load
    // bearing: the flow said what happened and then the window went away.
    const callbacks = { onSuccess: vi.fn(), onClose: vi.fn() };
    const source = launchWindow();
    const listener = listen(
      { origin: ORIGIN, source: () => source },
      callbacks
    );
    listeners.push(listener);

    deliver({ source, data: envelope("success", { connectionIds: [] }) });
    listener.dismiss();

    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it("is idempotent", () => {
    const onClose = vi.fn();
    const source = launchWindow();
    const listener = listen(
      { origin: ORIGIN, source: () => source },
      {
        onClose,
      }
    );
    listeners.push(listener);

    listener.dismiss();
    listener.dismiss();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
