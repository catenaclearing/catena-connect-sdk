import { act, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deliver,
  embedKey,
  frameIn,
  inviteUrl,
  type Mounted,
  mount,
  ORIGIN,
  probeFramesIn,
  probeMessage,
  settled,
  successMessage,
  surfacesIn,
} from "./test-utils";
import {
  type UseCatenaConnectOptions,
  type UseCatenaConnectResult,
  useCatenaConnect,
} from "./use-catena-connect";

/**
 * The hook on a button, the way an application uses it. `report` hands each
 * render's result out so a test can call `open()` and `destroy()` directly
 * and compare the functions across renders.
 */
function Launcher({
  report,
  ...options
}: UseCatenaConnectOptions & {
  report?: (result: UseCatenaConnectResult) => void;
}) {
  const result = useCatenaConnect(options);
  report?.(result);
  return (
    <button type="button" onClick={() => result.open()}>
      Connect
    </button>
  );
}

/** The hook mounting inline into an element the component owns. */
function InlineLauncher({
  report,
}: {
  report?: (result: UseCatenaConnectResult) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const result = useCatenaConnect({ inviteUrl, embedKey, container: ref });
  report?.(result);
  return (
    <>
      <div ref={ref} data-testid="mount" />
      <button type="button" onClick={() => result.open()}>
        Connect
      </button>
    </>
  );
}

const mounted: Mounted[] = [];

function render(element: Parameters<typeof mount>[0]): Mounted {
  const result = mount(element);
  mounted.push(result);
  return result;
}

function click(root: Mounted): void {
  const button = root.container.querySelector("button");
  if (button === null) throw new Error("no launch button rendered");
  act(() => {
    button.click();
  });
}

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  document.body.replaceChildren();
});

describe("useCatenaConnect", () => {
  it("launches on a click, into one surface on the document", async () => {
    const root = render(<Launcher inviteUrl={inviteUrl} embedKey={embedKey} />);

    click(root);

    expect(surfacesIn(document.body)).toHaveLength(1);
    await settled();
  });

  it("mounts inline into the container ref when one is given", async () => {
    const root = render(<InlineLauncher />);
    const target = root.container.querySelector('[data-testid="mount"]');
    if (target === null) throw new Error("no mount element rendered");

    click(root);

    expect(surfacesIn(target)).toHaveLength(1);
    expect(surfacesIn(document.body)).toHaveLength(0);
    await settled();
  });

  it("tears down a launch still waiting on the probe when it unmounts", () => {
    // An origin of its own, so this probe is genuinely unresolved rather than
    // answered from the cache a previous test warmed.
    const pending = "https://connect-pending.example.com/invite/abc123";
    const onSuccess = vi.fn();
    const root = render(
      <Launcher inviteUrl={pending} embedKey={embedKey} onSuccess={onSuccess} />
    );
    click(root);
    expect(surfacesIn(document.body)).toHaveLength(1);

    root.unmount();

    expect(surfacesIn(document.body)).toHaveLength(0);
    deliver(successMessage(["c1"]), window);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("removes the surface when it unmounts after the flow succeeded", async () => {
    const onSuccess = vi.fn();
    const root = render(
      <Launcher
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        onSuccess={onSuccess}
      />
    );
    click(root);
    await settled();
    const [surface] = surfacesIn(document.body);
    deliver(successMessage(["c1"]), frameIn(surface).contentWindow);
    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: ["c1"] });

    root.unmount();

    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("delivers to the handler from the latest render without relaunching", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const root = render(
      <Launcher inviteUrl={inviteUrl} embedKey={embedKey} onSuccess={first} />
    );
    click(root);
    await settled();
    const [surface] = surfacesIn(document.body);

    root.rerender(
      <Launcher inviteUrl={inviteUrl} embedKey={embedKey} onSuccess={second} />
    );
    deliver(successMessage(["c1"]), frameIn(surface).contentWindow);

    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ connectionIds: ["c1"] });
    expect(first).not.toHaveBeenCalled();
    expect(surfacesIn(document.body)[0]).toBe(surface);
  });

  it("keeps a live launch on its URL and uses a new one at the next launch", async () => {
    const changed = `${ORIGIN}/invite/def456`;
    const seen: UseCatenaConnectResult[] = [];
    const root = render(
      <Launcher
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        report={(r) => seen.push(r)}
      />
    );
    click(root);
    await settled();
    const [surface] = surfacesIn(document.body);
    const src = frameIn(surface).src;
    expect(src).toContain("/invite/abc123");

    root.rerender(
      <Launcher
        inviteUrl={changed}
        embedKey={embedKey}
        report={(r) => seen.push(r)}
      />
    );
    await settled();

    expect(surfacesIn(document.body)[0]).toBe(surface);
    expect(frameIn(surface).src).toBe(src);

    act(() => {
      seen[seen.length - 1].destroy();
      seen[seen.length - 1].open();
    });
    await settled();

    const [next] = surfacesIn(document.body);
    expect(next).not.toBe(surface);
    expect(frameIn(next).src).toContain("/invite/def456");
  });

  it("tears down a launch whose onClose handler unmounted the component", async () => {
    // Launching over a finished flow makes the core deliver that flow's
    // `onClose` synchronously, before the new launch exists. A handler that
    // unmounts the component there runs the cleanup with no handle to clean
    // up, and the launch the core goes on to create must not be left behind.
    const seen: UseCatenaConnectResult[] = [];
    let root: Mounted | null = null;
    const onClose = (): void => {
      root?.root.unmount();
    };
    root = mount(
      <Launcher
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        onClose={onClose}
        report={(r) => seen.push(r)}
      />
    );
    click(root);
    await settled();
    const [surface] = surfacesIn(document.body);
    deliver(successMessage(["c1"]), frameIn(surface).contentWindow);
    expect(surfacesIn(document.body)).toHaveLength(1);

    act(() => {
      seen[seen.length - 1].open();
    });
    await settled();

    expect(surfacesIn(document.body)).toHaveLength(0);
    root.container.remove();
  });

  it("launches nothing from a stale open() after unmount", () => {
    const seen: UseCatenaConnectResult[] = [];
    const root = render(
      <Launcher
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        report={(r) => seen.push(r)}
      />
    );
    root.unmount();

    act(() => {
      seen[0].open();
    });

    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("leaves another component's live flow alone when it unmounts", async () => {
    // Two components on one page. The core answers the second launch by
    // focusing the first; the second component must not come to own it.
    const first = render(
      <Launcher inviteUrl={inviteUrl} embedKey={embedKey} />
    );
    const second = render(
      <Launcher inviteUrl={inviteUrl} embedKey={embedKey} />
    );
    click(first);
    await settled();
    const [surface] = surfacesIn(document.body);

    click(second);
    await settled();
    expect(surfacesIn(document.body)).toHaveLength(1);
    expect(surfacesIn(document.body)[0]).toBe(surface);

    second.unmount();
    expect(surfacesIn(document.body)).toEqual([surface]);

    first.unmount();
    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("owns the launch that replaces another component's finished flow", async () => {
    const first = render(
      <Launcher inviteUrl={inviteUrl} embedKey={embedKey} />
    );
    const second = render(
      <Launcher inviteUrl={inviteUrl} embedKey={embedKey} />
    );
    click(first);
    await settled();
    const [finished] = surfacesIn(document.body);
    deliver(successMessage(["c1"]), frameIn(finished).contentWindow);

    click(second);
    await settled();
    const [replacement] = surfacesIn(document.body);
    expect(replacement).not.toBe(finished);

    first.unmount();
    expect(surfacesIn(document.body)).toEqual([replacement]);

    second.unmount();
    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("opens once when open() is called twice", async () => {
    const seen: UseCatenaConnectResult[] = [];
    render(
      <Launcher
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        report={(r) => seen.push(r)}
      />
    );

    act(() => {
      seen[0].open();
      seen[0].open();
    });

    expect(surfacesIn(document.body)).toHaveLength(1);
    await settled();
  });

  it("throws from open() while the invite URL is absent", () => {
    const seen: UseCatenaConnectResult[] = [];
    render(
      <Launcher
        inviteUrl={null}
        embedKey={embedKey}
        report={(r) => seen.push(r)}
      />
    );

    expect(() => seen[0].open()).toThrow(Error);
    expect(() => seen[0].open()).toThrow(/inviteUrl/);
    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("treats destroy() with nothing launched as a no-op", () => {
    const seen: UseCatenaConnectResult[] = [];
    render(
      <Launcher
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        report={(r) => seen.push(r)}
      />
    );

    expect(() => seen[0].destroy()).not.toThrow();
  });

  it("returns the same open and destroy functions across renders", () => {
    const seen: UseCatenaConnectResult[] = [];
    const root = render(
      <Launcher
        inviteUrl={inviteUrl}
        embedKey={embedKey}
        onSuccess={vi.fn()}
        report={(r) => seen.push(r)}
      />
    );

    root.rerender(
      <Launcher
        inviteUrl={`${ORIGIN}/invite/def456`}
        embedKey={embedKey}
        onSuccess={vi.fn()}
        report={(r) => seen.push(r)}
      />
    );

    expect(seen).toHaveLength(2);
    expect(seen[1].open).toBe(seen[0].open);
    expect(seen[1].destroy).toBe(seen[0].destroy);
  });
});

describe("useCatenaConnect preload", () => {
  // Each test here asks about a probe, and the core keeps one verdict per
  // origin for the life of the page. An origin of its own per test, so the
  // frame counted is the one this mount started and not one a previous test
  // left resolved.
  let origins = 0;
  function freshInvite(): string {
    origins += 1;
    return `https://connect-preload-${origins}.example.com/invite/abc123`;
  }

  it("starts the probe on mount, before any click", () => {
    render(<Launcher inviteUrl={freshInvite()} embedKey={embedKey} />);

    expect(probeFramesIn(document.body)).toHaveLength(1);
    expect(surfacesIn(document.body)).toHaveLength(0);
  });

  it("starts nothing when preload is off", () => {
    render(
      <Launcher inviteUrl={freshInvite()} embedKey={embedKey} preload={false} />
    );

    expect(probeFramesIn(document.body)).toHaveLength(0);
  });

  it("waits for the invite URL, then starts the probe once it arrives", () => {
    const root = render(<Launcher inviteUrl={null} embedKey={embedKey} />);
    expect(probeFramesIn(document.body)).toHaveLength(0);

    root.rerender(<Launcher inviteUrl={freshInvite()} embedKey={embedKey} />);

    expect(probeFramesIn(document.body)).toHaveLength(1);
  });

  it("probes with the embed key the launch will carry", () => {
    // The core holds one verdict per origin and key, so a keyless warm-up
    // would leave the launch a probe of its own to run.
    render(<Launcher inviteUrl={freshInvite()} embedKey={embedKey} />);

    const [probe] = probeFramesIn(document.body);
    expect(new URL(probe?.src ?? "").searchParams.get("embed_key")).toBe(
      embedKey
    );
  });

  it("leaves the launch no probe of its own to run", async () => {
    // The shared origin, which the test helpers answer from, and a key no
    // other test uses, so the verdict counted is the one this mount warmed.
    const root = render(
      <Launcher inviteUrl={inviteUrl} embedKey="pk_preload_warm" />
    );
    const [probe] = probeFramesIn(document.body);
    deliver(probeMessage(true), probe?.contentWindow ?? null);
    await act(async () => {});
    expect(probeFramesIn(document.body)).toHaveLength(0);

    click(root);

    expect(probeFramesIn(document.body)).toHaveLength(0);
    await act(async () => {});
    const [surface] = surfacesIn(document.body);
    expect(surface).toBeDefined();
    expect(frameIn(surface as Element)).not.toBeNull();
  });

  it("probes again when the embed key changes", () => {
    const url = freshInvite();
    const root = render(<Launcher inviteUrl={url} embedKey="pk_a" />);

    root.rerender(<Launcher inviteUrl={url} embedKey="pk_b" />);

    const keys = probeFramesIn(document.body).map((frame) =>
      new URL(frame.src).searchParams.get("embed_key")
    );
    expect(keys).toEqual(["pk_a", "pk_b"]);
  });

  it("starts one probe for one URL across re-renders", () => {
    const url = freshInvite();
    const root = render(
      <Launcher inviteUrl={url} embedKey={embedKey} onSuccess={vi.fn()} />
    );

    root.rerender(
      <Launcher inviteUrl={url} embedKey={embedKey} onSuccess={vi.fn()} />
    );

    expect(probeFramesIn(document.body)).toHaveLength(1);
  });
});
