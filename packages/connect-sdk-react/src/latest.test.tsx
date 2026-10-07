import type {
  ConnectCallbacks,
  ConnectSuccessEvent,
} from "@catenaclearing/connect-sdk";
import { useLayoutEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forwardCallbacks,
  useIsomorphicLayoutEffect,
  useLatest,
} from "./latest";
import { mount } from "./test-utils";

/**
 * A component shaped the way the hooks will be: the current handlers in a
 * `useLatest` ref, the forwarders created once and kept for the component's
 * life. `report` hands each render's forwarders out so a test can call them
 * as the core would, from outside React.
 */
function Harness({
  onSuccess,
  report,
}: {
  onSuccess?: (event: ConnectSuccessEvent) => void;
  report: (forwarders: ConnectCallbacks) => void;
}) {
  const latest = useLatest<ConnectCallbacks>({ onSuccess });
  const [forwarders] = useState(() => forwardCallbacks(latest));
  report(forwarders);
  return null;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useLatest + forwardCallbacks", () => {
  it("delivers to the handler from the most recent render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const seen: ConnectCallbacks[] = [];
    const mounted = mount(
      <Harness onSuccess={first} report={(f) => seen.push(f)} />
    );

    mounted.rerender(
      <Harness onSuccess={second} report={(f) => seen.push(f)} />
    );
    seen[0].onSuccess?.({ connectionIds: ["c1"] });

    expect(second).toHaveBeenCalledWith({ connectionIds: ["c1"] });
    expect(first).not.toHaveBeenCalled();
  });

  it("keeps the same forwarding functions across renders", () => {
    const seen: ConnectCallbacks[] = [];
    const mounted = mount(
      <Harness onSuccess={vi.fn()} report={(f) => seen.push(f)} />
    );

    mounted.rerender(
      <Harness onSuccess={vi.fn()} report={(f) => seen.push(f)} />
    );

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[1].onSuccess).toBe(seen[0].onSuccess);
  });

  it("is a no-op for a handler the render left out", () => {
    const seen: ConnectCallbacks[] = [];
    mount(<Harness report={(f) => seen.push(f)} />);

    expect(() => seen[0].onSuccess?.({ connectionIds: [] })).not.toThrow();
    expect(() => seen[0].onClose?.({})).not.toThrow();
  });

  it("forwards all five events", () => {
    const latest = {
      current: {
        onOpen: vi.fn(),
        onConnection: vi.fn(),
        onSuccess: vi.fn(),
        onExit: vi.fn(),
        onClose: vi.fn(),
      },
    };
    const forwarders = forwardCallbacks(latest);

    forwarders.onOpen?.({});
    forwarders.onConnection?.({ connectionId: "c1" });
    forwarders.onSuccess?.({ connectionIds: ["c1"] });
    forwarders.onExit?.({ reason: "user" });
    forwarders.onClose?.({});

    expect(latest.current.onOpen).toHaveBeenCalledWith({});
    expect(latest.current.onConnection).toHaveBeenCalledWith({
      connectionId: "c1",
    });
    expect(latest.current.onSuccess).toHaveBeenCalledWith({
      connectionIds: ["c1"],
    });
    expect(latest.current.onExit).toHaveBeenCalledWith({ reason: "user" });
    expect(latest.current.onClose).toHaveBeenCalledWith({});
  });

  it("refreshes the ref in a layout effect in the browser", () => {
    expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect);
  });
});
