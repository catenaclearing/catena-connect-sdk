import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { open, preload } from "./index";
import { mountFrame, openPopup, watchClosed } from "./modes";
import { resolvedVerdict } from "./probe";
import { createSurface } from "./surface";

const LAUNCH_URL = "https://connect.example.com/flow";

/**
 * A fresh origin for every launch that resolves a verdict.
 *
 * The verdict is cached for the life of the page, so tests sharing one
 * origin would inherit each other's answers — and the one test that wants
 * that inheritance says so by reusing its own origin.
 */
let origins = 0;
function nextInvite(): { origin: string; inviteUrl: string } {
  origins += 1;
  const origin = `https://connect-${origins}.example.com`;
  return { origin, inviteUrl: `${origin}/i/abc123` };
}

/** The hidden probe frame, which is the only frame in the body. */
function probeFrame(): HTMLIFrameElement | null {
  return document.body.querySelector("iframe");
}

/** The surface's host element — the one thing in the body with a root. */
function surfaceHost(): Element | null {
  return (
    [...document.body.children].find((el) => el.shadowRoot !== null) ?? null
  );
}

/** The frame the flow runs in. It lives inside the shadow root. */
function flowFrame(): HTMLIFrameElement | null {
  return surfaceHost()?.shadowRoot?.querySelector("iframe") ?? null;
}

/** The continue affordance, which lives inside the shadow root too. */
function continueButton(): HTMLButtonElement | null {
  return surfaceHost()?.shadowRoot?.querySelector("button") ?? null;
}

/**
 * A stand-in for the window the browser hands back.
 *
 * jsdom opens none, so this carries the three members the package touches:
 * the flag the watchdog polls, and the two cross-origin-accessible methods
 * it calls. Closing sets the flag, as a real window does.
 */
type FakeWindow = Window & {
  closed: boolean;
  close: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
};

function fakeWindow(): FakeWindow {
  const win = {
    closed: false,
    close: vi.fn(() => {
      win.closed = true;
    }),
    focus: vi.fn(),
  };
  return win as unknown as FakeWindow;
}

/** Send an event as the flow would, from the window this launch created. */
function sendEvent(origin: string, source: unknown, event: string): void {
  const message = new MessageEvent("message", {
    data: { source: "catena-connect", version: "1", event },
    origin,
  });
  Object.defineProperty(message, "source", {
    value: source,
    configurable: true,
  });
  window.dispatchEvent(message);
}

function verdict(supported: boolean): unknown {
  return {
    source: "catena-connect",
    version: "1",
    event: "probe",
    payload: { supported },
  };
}

/** Answer the probe as the page on the connect origin would. */
async function answerProbe(origin: string, supported: boolean): Promise<void> {
  const event = new MessageEvent("message", {
    data: verdict(supported),
    origin,
  });
  Object.defineProperty(event, "source", {
    value: probeFrame()?.contentWindow,
    configurable: true,
  });
  window.dispatchEvent(event);
  // The verdict is put into effect on a microtask, not synchronously.
  await vi.advanceTimersByTimeAsync(0);
}

const handles: Array<{ destroy(): void }> = [];

const realLocation = window.location;

beforeEach(() => {
  vi.useFakeTimers();
  // A refused window is redirect mode's cue, so every refusal below assigns
  // the tab. jsdom implements no navigation, and its whole `location` is
  // replaced rather than the method spied on because `assign` is defined
  // non-configurable there. Redirect mode itself is covered in
  // `pending.test.ts`; here the assignment only needs somewhere to land.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: vi.fn() },
  });
});

afterEach(() => {
  while (handles.length > 0) handles.pop()?.destroy();
  vi.useRealTimers();
  // `window.open` is spied on throughout, and a spy surviving into the next
  // test would answer a question it was never asked.
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
  window.sessionStorage.clear();
  document.body.replaceChildren();
});

describe("the frame the flow runs in", () => {
  it("points at the launch URL it was given", () => {
    const surface = createSurface();

    const frame = mountFrame(surface, LAUNCH_URL);

    expect(frame.src).toBe(LAUNCH_URL);
  });

  it("mounts inside the surface, not the host document", () => {
    const surface = createSurface();

    mountFrame(surface, LAUNCH_URL);

    expect(surface.mount.querySelector("iframe")).not.toBeNull();
    expect(document.body.querySelector("iframe")).toBeNull();
  });

  it("replaces the loading state rather than stacking on it", () => {
    const surface = createSurface();
    surface.showLoading();

    mountFrame(surface, LAUNCH_URL);

    expect(surface.mount.querySelector(".status")?.textContent).toBe("");
  });

  it("is not sandboxed", () => {
    // Provider consent pages cannot be framed, so the flow opens a window of
    // its own for that step. A `sandbox` without `allow-popups` silently
    // prevents it, and one carrying every token needed to keep it working
    // re-grants what it removed. This assertion is the guard against a
    // future tidy-up, because the failure only reproduces against a real
    // provider.
    const frame = mountFrame(createSurface(), LAUNCH_URL);

    expect(frame.hasAttribute("sandbox")).toBe(false);
  });

  it("grants only what the flow needs", () => {
    const frame = mountFrame(createSurface(), LAUNCH_URL);

    expect(frame.getAttribute("allow")).toBe("clipboard-write");
  });

  it("fills its surface and carries no sizing of its own", () => {
    // The flow lays itself out at whatever size the surface is. Asserting
    // the absence of width/height is the half that matters: a measurement
    // or resize protocol is what this is keeping out.
    const frame = mountFrame(createSurface(), LAUNCH_URL);

    expect(frame.className).toBe("frame");
    expect(frame.hasAttribute("width")).toBe(false);
    expect(frame.hasAttribute("height")).toBe(false);
    expect(frame.style.width).toBe("");
  });
});

describe("launching on a supported verdict", () => {
  it("mounts a frame at the built launch URL", async () => {
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", variant: "card" }));

    await answerProbe(origin, true);

    const src = flowFrame()?.src ?? "";
    expect(src.startsWith(`${origin}/i/abc123?`)).toBe(true);
    expect(src).toContain("embed=iframe");
    expect(src).toContain("embed_key=pk_test");
    expect(src).toContain("variant=card");
  });

  it("points the frame where the options said at the call, not after", async () => {
    // The probe puts up to a second between the call and the mount. A
    // caller re-rendering in that window must not be able to move the
    // frame somewhere else.
    const { origin, inviteUrl } = nextInvite();
    const options = { inviteUrl, embedKey: "pk_test", variant: "card" };
    handles.push(open(options));

    options.variant = "full";
    options.embedKey = "pk_other";
    await answerProbe(origin, true);

    const src = flowFrame()?.src ?? "";
    expect(src).toContain("variant=card");
    expect(src).toContain("embed_key=pk_test");
  });

  it("probes with the launch's own embed key", () => {
    // The app lets only the key's registered origins frame a probe that
    // names the key, so the verdict this launch acts on has to be the one
    // measured with its key.
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    const src = new URL(probeFrame()?.src ?? "");
    expect(src.origin + src.pathname).toBe(`${origin}/embed/probe`);
    expect(src.searchParams.get("embed_key")).toBe("pk_test");
  });

  it("falls back to the window when the probe with its key goes unanswered", async () => {
    // What an origin the key does not cover looks like from here: the app
    // refuses to be framed, the probe never answers, and the user is offered
    // the window rather than shown a frame the browser will not render.
    const { inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_unregistered" }));

    await vi.advanceTimersByTimeAsync(2500);

    expect(flowFrame()).toBeNull();
    expect(continueButton()).not.toBeNull();
  });

  it("opens no window", async () => {
    // Frame mode needs no user gesture and costs no popup. A window opened
    // here would be spent on the 99% path to serve the 1%.
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    const { origin, inviteUrl } = nextInvite();

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await answerProbe(origin, true);

    expect(flowFrame()).not.toBeNull();
    expect(opened).not.toHaveBeenCalled();
  });

  it("shows a loading state only until the verdict arrives", async () => {
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    const status = () =>
      surfaceHost()?.shadowRoot?.querySelector(".status")?.textContent;
    expect(status()).not.toBe("");

    await answerProbe(origin, true);

    expect(status()).toBe("");
  });

  it("skips the loading state once the page already has a verdict", async () => {
    // The same origin twice, deliberately: this is the reuse the cache is
    // for, and the second launch has nothing left to wait on.
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await answerProbe(origin, true);
    handles.pop()?.destroy();

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    expect(
      surfaceHost()?.shadowRoot?.querySelector(".status")?.textContent
    ).toBe("");
    expect(probeFrame()).toBeNull();
  });

  it("tears the frame down with the launch", async () => {
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await answerProbe(origin, true);
    expect(flowFrame()).not.toBeNull();

    handles.pop()?.destroy();

    expect(surfaceHost()).toBeNull();
  });

  it("mounts nothing when the launch was torn down while the probe ran", async () => {
    // A component unmounting behind a modal is the ordinary way this
    // happens, and a frame appearing afterwards would be a leak.
    const { origin, inviteUrl } = nextInvite();
    const handle = open({ inviteUrl, embedKey: "pk_test" });
    handle.destroy();

    await answerProbe(origin, true);

    expect(flowFrame()).toBeNull();
    expect(surfaceHost()).toBeNull();
  });
});

describe("the window the flow runs in", () => {
  it("opens the launch URL under the fixed window name", () => {
    // Asserted on the arguments, not on delivery: jsdom opens no window and
    // has no popup blocker, so what this can prove is what we asked for.
    const opened = vi.spyOn(window, "open").mockReturnValue(fakeWindow());

    openPopup(LAUNCH_URL);

    expect(opened).toHaveBeenCalledWith(LAUNCH_URL, "catena-connect");
  });

  it("does not sever the opener", () => {
    // The completion travels back through the opener. Severing it is silent:
    // the user still finishes and the caller is told nothing. The features
    // string is the only way `noopener` gets in, so the assertion is that
    // there is no features string at all.
    const opened = vi.spyOn(window, "open").mockReturnValue(fakeWindow());

    openPopup(LAUNCH_URL);

    const args = opened.mock.calls[0] ?? [];
    expect(args).toHaveLength(2);
    expect(args.join(" ")).not.toContain("noopener");
  });

  it("reports a refusal rather than a window", () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    expect(openPopup(LAUNCH_URL)).toBeNull();
  });

  it("reports a refusal that came back undefined rather than null", () => {
    // Not every browser answers a blocked window with `null`. The spec's
    // condition is falsy, and redirect mode reads one value.
    vi.spyOn(window, "open").mockReturnValue(undefined as unknown as Window);

    expect(openPopup(LAUNCH_URL)).toBeNull();
  });

  it("reports a window handed back already closed as a refusal", () => {
    // Some blockers answer with a handle that is closed before the page ever
    // sees it. Taken for a window, the watchdog would dismiss the launch half
    // a second later with no outcome, and the redirect would never run.
    const popup = fakeWindow();
    popup.closed = true;
    vi.spyOn(window, "open").mockReturnValue(popup);

    expect(openPopup(LAUNCH_URL)).toBeNull();
  });

  it("hands back a window that is open", () => {
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);

    expect(openPopup(LAUNCH_URL)).toBe(popup);
  });

  it("hands back a window that will not say whether it closed", () => {
    // Taken as open. Throwing here would escape the user's click and launch
    // nothing at all.
    const popup = fakeWindow();
    Object.defineProperty(popup, "closed", {
      get() {
        throw new Error("refused");
      },
    });
    vi.spyOn(window, "open").mockReturnValue(popup);

    expect(openPopup(LAUNCH_URL)).toBe(popup);
  });
});

describe("the watchdog on that window", () => {
  it("notices the window closing", () => {
    const popup = fakeWindow();
    const onClosed = vi.fn();
    watchClosed(popup, onClosed);

    // The control: while the window is open, nothing fires.
    vi.advanceTimersByTime(5000);
    expect(onClosed).not.toHaveBeenCalled();

    popup.closed = true;
    vi.advanceTimersByTime(1000);

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("reports the close once, not once per poll", () => {
    const popup = fakeWindow();
    const onClosed = vi.fn();
    watchClosed(popup, onClosed);

    popup.closed = true;
    vi.advanceTimersByTime(10_000);

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("keeps watching, without throwing, a window whose closed getter throws", () => {
    const popup = fakeWindow();
    Object.defineProperty(popup, "closed", {
      get() {
        throw new Error("denied");
      },
    });
    const onClosed = vi.fn();
    watchClosed(popup, onClosed);

    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("stops when it is told to", () => {
    const popup = fakeWindow();
    const onClosed = vi.fn();

    const stop = watchClosed(popup, onClosed);
    stop();
    popup.closed = true;
    vi.advanceTimersByTime(10_000);

    expect(onClosed).not.toHaveBeenCalled();
  });
});

describe("relaunching out of a terminal callback", () => {
  it("delivers the dismissal the app had already sent", async () => {
    // Starting the next flow from `onSuccess` is an ordinary thing to do, and
    // the app posts `close` immediately behind the outcome — so the caller is
    // standing in a handler with that message already queued behind them.
    // Replacing the launch used to drop it, and `onClose` never arrived.
    const { origin, inviteUrl } = nextInvite();
    const onClose = vi.fn();

    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));
    await answerProbe(origin, true);
    sendEvent(origin, flowFrame()?.contentWindow, "success");

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hands back the launch a caller starts from onClose, rather than destroying it", async () => {
    // `dismiss()` delivers `onClose` synchronously, and a caller may start
    // the next flow from there as readily as from `onSuccess`. The nested
    // `open()` replaces the finished launch; the outer call has to notice and
    // return what they already have. Tearing down the slot's current holder
    // instead destroyed the handle they were just given and started a third
    // flow behind it.
    const { origin, inviteUrl } = nextInvite();
    let nested: ReturnType<typeof open> | null = null;
    const onClose = vi.fn(() => {
      nested = open({ inviteUrl, embedKey: "pk_test" });
      handles.push(nested);
    });

    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));
    await answerProbe(origin, true);
    sendEvent(origin, flowFrame()?.contentWindow, "success");

    const outer = open({ inviteUrl, embedKey: "pk_test" });
    handles.push(outer);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).toBe(nested);
    // One surface standing: the nested launch's, untouched.
    expect(
      [...document.body.children].filter((el) => el.shadowRoot !== null)
    ).toHaveLength(1);
  });

  it("adds no second dismissal to a flow that sent its own", async () => {
    const { origin, inviteUrl } = nextInvite();
    const onClose = vi.fn();

    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));
    await answerProbe(origin, true);
    sendEvent(origin, flowFrame()?.contentWindow, "success");
    sendEvent(origin, flowFrame()?.contentWindow, "close");

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("launching on an unsupported verdict", () => {
  it("offers the user a way to continue instead of a frame", async () => {
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);

    expect(continueButton()).not.toBeNull();
    expect(flowFrame()).toBeNull();
  });

  it("offers it inside the caller's container rather than over it", async () => {
    // The descent is not an overlay feature. A caller mounting inline gets
    // the affordance where the frame would have gone, because the
    // alternative is a container they reserved space for that stays empty
    // on every browser the frame cannot be carried on — with nothing on the
    // page saying why or offering a way on.
    const container = document.createElement("section");
    document.body.append(container);
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", container }));

    await answerProbe(origin, false);

    const host = [...container.children].find((el) => el.shadowRoot !== null);
    expect(host?.shadowRoot?.querySelector("button")).not.toBeNull();
    // And nothing of ours went up over their page alongside it.
    expect(surfaceHost()).toBeNull();
  });

  it("tells the user what is about to happen", async () => {
    // A window the user asked for, rather than one that happened to them.
    // Announced through the live region the loading state used, so the
    // change from one to the other is a change a screen reader reports.
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);

    const region = surfaceHost()?.shadowRoot?.querySelector("[role='status']");
    expect(region?.textContent).toMatch(/new window/i);
  });

  it("opens no window until the user activates it", async () => {
    const opened = vi.spyOn(window, "open").mockReturnValue(fakeWindow());
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);
    expect(opened).not.toHaveBeenCalled();

    // The control for the silence above: the activation does open one.
    continueButton()?.click();

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("opens the URL built at the call, under the fixed name", async () => {
    const opened = vi.spyOn(window, "open").mockReturnValue(fakeWindow());
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", variant: "card" }));

    await answerProbe(origin, false);
    continueButton()?.click();

    const [url, name] = opened.mock.calls[0] ?? [];
    expect(String(url).startsWith(`${origin}/i/abc123?`)).toBe(true);
    expect(String(url)).toContain("embed=popup");
    expect(String(url)).toContain("embed_key=pk_test");
    expect(String(url)).toContain("variant=card");
    expect(name).toBe("catena-connect");
  });

  it("delivers the flow's events from the window it opened", async () => {
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const onOpen = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onOpen }));

    await answerProbe(origin, false);
    continueButton()?.click();
    sendEvent(origin, popup, "open");

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders the affordance with no loading state when the page already knows", async () => {
    // The same origin twice, deliberately. Once the verdict is cached there
    // is nothing left to wait for on either answer, so a loading state here
    // would be a flicker on its way to the affordance.
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await answerProbe(origin, false);
    handles.pop()?.destroy();

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(continueButton()).not.toBeNull();
    expect(probeFrame()).toBeNull();
  });

  it("brings the open window forward rather than restarting the flow in it", async () => {
    // The affordance stays live because a window can slip behind the page,
    // and this is what the user does about it. Reopening would not do that:
    // the fixed name finds this window and navigates it, throwing away
    // whatever the user had already filled in.
    const popup = fakeWindow();
    const opened = vi.spyOn(window, "open").mockReturnValue(popup);
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);
    continueButton()?.click();
    continueButton()?.click();

    expect(opened).toHaveBeenCalledTimes(1);
    expect(popup.focus).toHaveBeenCalledTimes(1);
  });

  it("brings forward a window whose closed getter throws, without throwing", async () => {
    const popup = fakeWindow();
    Object.defineProperty(popup, "closed", {
      get() {
        throw new Error("denied");
      },
    });
    const opened = vi.spyOn(window, "open").mockReturnValue(popup);
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);
    continueButton()?.click();
    continueButton()?.click();

    expect(opened).toHaveBeenCalledTimes(1);
    expect(popup.focus).toHaveBeenCalledTimes(1);
  });

  it("keeps one watchdog across a repeat activation", async () => {
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();
    continueButton()?.click();

    popup.closed = true;
    vi.advanceTimersByTime(1000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("a window handed back already closed", () => {
  // The same refusal as `null`, reported differently. `pending.test.ts`
  // covers the record it writes; here it is the window's half: the launch
  // goes to the redirect, and nothing is left watching a window that was
  // never there.

  function closedWindow(): FakeWindow {
    const popup = fakeWindow();
    popup.closed = true;
    return popup;
  }

  it("takes the tab to the flow instead", async () => {
    vi.spyOn(window, "open").mockReturnValue(closedWindow());
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);
    continueButton()?.click();

    const assign = window.location.assign as ReturnType<typeof vi.fn>;
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0]?.[0]).toContain("embed=redirect");
  });

  it("emits no dismissal and starts no watchdog", async () => {
    vi.spyOn(window, "open").mockReturnValue(closedWindow());
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(5000);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("still watches a window that opened normally", async () => {
    // The control: the check is on the handle as it comes back, not on
    // every window, so an ordinary window keeps its watchdog and its close.
    vi.spyOn(window, "open").mockReturnValue(fakeWindow());
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("a window the browser refused", () => {
  // The refusal is redirect mode's cue, and redirect mode is covered in
  // `pending.test.ts` — including the navigation itself. What is left here
  // is the part that belongs to the window: a launch whose window the user
  // closed, and whose replacement the browser then refused, must not have a
  // watch or a guard still pointing at the window it has moved off.

  it("does not let a closed window's watch end a retry it refused", async () => {
    // The user closed the window and asked to continue again inside the
    // half second before the watchdog polled, and the browser refused that
    // one. A watch left running on the closed window would fire a dismissal
    // into a page that is redirecting, which is a dismissal the caller
    // would then receive a second time on resume.
    const first = fakeWindow();
    vi.spyOn(window, "open")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(null);
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();
    first.closed = true;
    continueButton()?.click();

    vi.advanceTimersByTime(5000);

    expect(onClose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts nothing from the window it closed and could not replace", async () => {
    // The guard has to come off the closed window too, not just the watch.
    const first = fakeWindow();
    vi.spyOn(window, "open")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(null);
    const onOpen = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onOpen }));

    await answerProbe(origin, false);
    continueButton()?.click();
    first.closed = true;
    continueButton()?.click();

    sendEvent(origin, first, "open");

    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("the user closing the window themselves", () => {
  it("runs the dismissal no message was ever going to bring", async () => {
    // Closing a window posts nothing. Without the watchdog the launch stays
    // live forever, listening for a window that is gone.
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();
    expect(onClose).not.toHaveBeenCalled();

    popup.closed = true;
    vi.advanceTimersByTime(1000);

    expect(onClose).toHaveBeenCalledWith({});
  });

  it("does not double a dismissal the flow already sent", async () => {
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();

    // The app dismissed and then closed its own window.
    sendEvent(origin, popup, "close");
    popup.closed = true;
    vi.advanceTimersByTime(1000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves to the window the user reopened inside the watchdog's gap", async () => {
    // Closing the window and activating again before the next poll is the
    // race: the browser makes a second window, because the fixed name no
    // longer refers to a live one. Mistaking it for an ordinary repeat
    // activation would discard a window the user is looking at, leave the
    // guard pointed at the closed one, and then let the stale watchdog
    // dismiss a launch that is running.
    const first = fakeWindow();
    const second = fakeWindow();
    vi.spyOn(window, "open")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onOpen, onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();
    first.closed = true;
    continueButton()?.click();

    // The watch the first window left behind must not end the launch.
    vi.advanceTimersByTime(1000);
    expect(onClose).not.toHaveBeenCalled();

    // And the guard has to be on the window the flow is actually in.
    sendEvent(origin, second, "open");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("watches the reopened window in place of the one it replaced", async () => {
    const first = fakeWindow();
    const second = fakeWindow();
    vi.spyOn(window, "open")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();
    first.closed = true;
    continueButton()?.click();

    // The launch runs on in the new window, so nothing has ended yet — the
    // watch that would have said otherwise belonged to the window it moved
    // off, and went with it.
    vi.advanceTimersByTime(1000);
    expect(onClose).not.toHaveBeenCalled();

    // What ends it is this window closing, which is what is now watched.
    second.closed = true;
    vi.advanceTimersByTime(1000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves no watch behind a window it moved off", async () => {
    const first = fakeWindow();
    const second = fakeWindow();
    vi.spyOn(window, "open")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);
    continueButton()?.click();
    first.closed = true;
    continueButton()?.click();

    // One window, one watchdog — the replaced one is stopped, not stacked.
    // A guard against the replacement above growing a second timer, rather
    // than a reproduction of anything: the count is right either way until
    // someone forgets to stop the watch they are replacing.
    expect(vi.getTimerCount()).toBe(1);

    handles.pop()?.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases the slot, so the caller can launch again", async () => {
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const { origin, inviteUrl } = nextInvite();
    const first = open({ inviteUrl, embedKey: "pk_test" });
    handles.push(first);

    await answerProbe(origin, false);
    continueButton()?.click();
    popup.closed = true;
    vi.advanceTimersByTime(1000);

    const second = open({ inviteUrl, embedKey: "pk_test" });
    handles.push(second);

    // A live launch hands back its own handle; a finished one is replaced.
    expect(second).not.toBe(first);
  });

  it("leaves no interval behind the launch it belonged to", async () => {
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const onClose = vi.fn();
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", onClose }));

    await answerProbe(origin, false);
    continueButton()?.click();
    handles.pop()?.destroy();

    popup.closed = true;
    vi.advanceTimersByTime(10_000);

    // Silence here is only meaningful because the same shape without the
    // teardown, two tests above, delivers.
    expect(onClose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes its window down with it", async () => {
    // Frame mode removes its frame on teardown; a window left standing is
    // the same leak with a larger blast radius, because the user is still
    // in a flow whose completion nobody is listening for.
    const popup = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);
    continueButton()?.click();
    expect(popup.closed).toBe(false);

    handles.pop()?.destroy();

    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.closed).toBe(true);
  });

  it("does not leave its window for the next launch to inherit", async () => {
    // The window name is fixed, so a window left standing is the very one
    // the next launch would be handed — still showing the finished flow's
    // document, which passes all three guards on the way in. The next launch
    // has to start from a window of its own.
    const first = fakeWindow();
    const second = fakeWindow();
    const opened = vi
      .spyOn(window, "open")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    await answerProbe(origin, false);
    continueButton()?.click();

    // The flow ran to its end, and the caller launched again without
    // tearing the first one down — which is what replaces it.
    sendEvent(origin, first, "success");
    sendEvent(origin, first, "close");
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await vi.advanceTimersByTimeAsync(0);
    continueButton()?.click();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(2);
  });

  it("finishes the teardown when the window will not say whether it closed", async () => {
    // A cleanup that throws takes the rest of the teardown with it: the
    // surface would stay on the host page and the launch slot would
    // stay pinned, so they could never launch again. A window that will not
    // close is not worth that.
    const popup = fakeWindow();
    Object.defineProperty(popup, "closed", {
      get() {
        throw new Error("refused");
      },
    });
    vi.spyOn(window, "open").mockReturnValue(popup);
    const { origin, inviteUrl } = nextInvite();
    const handle = open({ inviteUrl, embedKey: "pk_test" });

    await answerProbe(origin, false);
    continueButton()?.click();

    expect(() => handle.destroy()).not.toThrow();
    expect(surfaceHost()).toBeNull();

    // The slot is free, which is the part a thrown cleanup would have cost.
    const second = open({ inviteUrl, embedKey: "pk_test" });
    handles.push(second);
    expect(second).not.toBe(handle);
  });

  it("does not throw when the window will not let itself be closed", async () => {
    const popup = fakeWindow();
    popup.close.mockImplementation(() => {
      throw new Error("refused");
    });
    vi.spyOn(window, "open").mockReturnValue(popup);
    const { origin, inviteUrl } = nextInvite();
    const handle = open({ inviteUrl, embedKey: "pk_test" });

    await answerProbe(origin, false);
    continueButton()?.click();

    expect(() => handle.destroy()).not.toThrow();
    expect(surfaceHost()).toBeNull();
  });

  it("opens no window once the launch has been torn down", async () => {
    // The affordance can still be on screen in a caller's container that
    // their own teardown has not removed yet.
    const opened = vi.spyOn(window, "open").mockReturnValue(fakeWindow());
    const { origin, inviteUrl } = nextInvite();
    const container = document.createElement("section");
    document.body.append(container);
    const handle = open({ inviteUrl, embedKey: "pk_test", container });

    await answerProbe(origin, false);
    const button = container
      .querySelector("*")
      ?.shadowRoot?.querySelector("button") as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    handle.destroy();
    button?.click();

    expect(opened).not.toHaveBeenCalled();
  });
});

describe("resolving the verdict ahead of a launch", () => {
  it("probes the origin the invitation names", () => {
    const { origin, inviteUrl } = nextInvite();

    preload({ inviteUrl });

    expect(probeFrame()?.src).toBe(`${origin}/embed/probe`);
  });

  it("leaves the next launch nothing to wait for", async () => {
    // The whole of what it buys. The launch that follows a resolved verdict
    // mounts its frame with no loading state in between, because there is
    // no round trip left to run.
    const { origin, inviteUrl } = nextInvite();
    preload({ inviteUrl, embedKey: "pk_test" });
    await answerProbe(origin, true);

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    expect(probeFrame()).toBeNull();

    // Nothing was ever put up to replace: the status is empty from the
    // first frame the user could see, rather than holding "Loading…" until
    // the verdict lands.
    expect(
      surfaceHost()?.shadowRoot?.querySelector(".status")?.textContent
    ).toBe("");
    // The mount itself still lands on a microtask — the verdict is read
    // through a promise either way, and that is what keeps a warm launch
    // and a cold one the same shape.
    await vi.advanceTimersByTimeAsync(0);
    expect(flowFrame()).not.toBeNull();
  });

  it("changes nothing about how that launch behaves", async () => {
    // "An optimization, never a requirement" is a claim about the verdict,
    // not just about the loading state: a warmed page must descend to the
    // affordance on an unsupported verdict exactly as a cold one does.
    const { origin, inviteUrl } = nextInvite();
    preload({ inviteUrl, embedKey: "pk_test" });
    await answerProbe(origin, false);

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(continueButton()).not.toBeNull();
    expect(flowFrame()).toBeNull();
  });

  it("names the key on the probe when it is given one", () => {
    const { origin, inviteUrl } = nextInvite();

    preload({ inviteUrl, embedKey: "pk_test" });

    const src = new URL(probeFrame()?.src ?? "");
    expect(src.origin + src.pathname).toBe(`${origin}/embed/probe`);
    expect(src.searchParams.get("embed_key")).toBe("pk_test");
  });

  it("leaves a launch with a key its own probe when it was given none", async () => {
    // The verdict is held per origin and key, because the app decides by the
    // key whether this page may frame the flow. A keyless `supported` says
    // nothing about the key the launch carries, so the launch measures again
    // and waits for its own answer.
    const { origin, inviteUrl } = nextInvite();
    preload({ inviteUrl });
    await answerProbe(origin, true);
    expect(probeFrame()).toBeNull();

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));

    expect(
      surfaceHost()?.shadowRoot?.querySelector(".status")?.textContent
    ).not.toBe("");
    const src = new URL(probeFrame()?.src ?? "");
    expect(src.searchParams.get("embed_key")).toBe("pk_test");

    // Unanswered, as a probe from an origin the key does not cover is: the
    // launch falls back to the window instead of mounting a frame.
    await vi.advanceTimersByTimeAsync(2500);
    expect(flowFrame()).toBeNull();
    expect(continueButton()).not.toBeNull();
  });

  it("warms nothing for a launch with a different key", async () => {
    const { origin, inviteUrl } = nextInvite();
    preload({ inviteUrl, embedKey: "pk_a" });
    await answerProbe(origin, true);

    handles.push(open({ inviteUrl, embedKey: "pk_b" }));

    const src = new URL(probeFrame()?.src ?? "");
    expect(src.searchParams.get("embed_key")).toBe("pk_b");
  });

  it("runs one probe however many times it is called", async () => {
    // Repeated calls are ordinary — a caller may warm the same invitation
    // from more than one component. The probe's own dedupe is
    // what makes that free, and this is the assertion that keeps it so.
    const { origin, inviteUrl } = nextInvite();

    preload({ inviteUrl });
    preload({ inviteUrl });
    expect(document.body.querySelectorAll("iframe")).toHaveLength(1);

    await answerProbe(origin, true);
    preload({ inviteUrl });

    expect(probeFrame()).toBeNull();
  });

  it("waits for a document rather than probing without one", async () => {
    // The caller most likely to warm early is the one calling this from a
    // script in the head, where there is no body to mount the probe frame
    // on. Probing there would measure nothing.
    const body = document.body;
    Object.defineProperty(document, "body", {
      configurable: true,
      value: null,
    });
    const { origin, inviteUrl } = nextInvite();

    preload({ inviteUrl });
    Object.defineProperty(document, "body", {
      configurable: true,
      value: body,
    });
    expect(probeFrame()).toBeNull();

    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(probeFrame()?.src).toBe(`${origin}/embed/probe`);
    await answerProbe(origin, true);
    expect(resolvedVerdict(origin)).toBe("supported");
  });

  it("leaves a launch that follows an early call free to measure", async () => {
    // The failure this guards: a probe that could not be set up must not be
    // remembered as an answer. If it were, warming from the head would put
    // the page on the fallback for the rest of its life — which would make
    // calling this strictly worse than not calling it, the opposite of what
    // it is offered as.
    const body = document.body;
    Object.defineProperty(document, "body", {
      configurable: true,
      value: null,
    });
    const { origin, inviteUrl } = nextInvite();
    preload({ inviteUrl });
    Object.defineProperty(document, "body", {
      configurable: true,
      value: body,
    });

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await answerProbe(origin, true);

    expect(flowFrame()).not.toBeNull();
    expect(continueButton()).toBeNull();
  });

  it("probes nothing for an invitation whose origin is opaque", () => {
    // The scheme check lives in `connectOrigin`, so warming inherits it for
    // free — and inherits it as silence rather than as a throw, which is
    // what this asserts. Probing "null" would have mounted a frame at a
    // relative URL on the host page's own server.
    expect(() => preload({ inviteUrl: "about:blank" })).not.toThrow();
    expect(probeFrame()).toBeNull();
  });

  it("does not throw on an invitation it can derive no origin from", () => {
    // A hint that can break the page is more dangerous to add than to leave
    // out. The same URL still throws from `open()`, where a launch is at
    // stake — here there is nothing to get wrong by staying quiet.
    expect(() => preload({ inviteUrl: "" })).not.toThrow();
    expect(probeFrame()).toBeNull();
  });
});

describe("a probe outlives the launch that was torn down while it ran", () => {
  it("settles on its own, and the next launch finds the verdict waiting", async () => {
    // The probe is the page's, not the launch's. `preload()` runs one with no
    // launch at all, and the verdict is kept for the life of the page. So a
    // launch destroyed mid-probe leaves it to finish — a hidden frame and a
    // timer bounded by the budget, which then remove themselves — and the
    // launch after it skips the loading state. Cancelling it would throw away
    // an answer seconds from arriving, and would have to be reference-counted
    // against a preload or a second launch sharing the same round trip.
    const { origin, inviteUrl } = nextInvite();

    open({ inviteUrl, embedKey: "pk_test" }).destroy();
    expect(probeFrame()).not.toBeNull();

    await answerProbe(origin, true);
    expect(probeFrame()).toBeNull();

    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    // The loading state is skipped synchronously when a verdict is held.
    expect(
      surfaceHost()?.shadowRoot?.querySelector(".status")?.textContent
    ).toBe("");
    await Promise.resolve();
    await Promise.resolve();
    expect(flowFrame()).not.toBeNull();
  });
});
