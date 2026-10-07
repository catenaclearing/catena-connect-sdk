/**
 * Redirect mode, and the record that carries its outcome across the
 * navigation.
 *
 * jsdom does not navigate, which is the one thing that makes these tests
 * possible: the page survives the assignment, so a single test can drive the
 * launch that redirects and then the `resume()` that would run on the far
 * side of it. The assignment itself is asserted on rather than followed —
 * quickstart §4 is where a real tab actually moves.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ConnectCallbacks, open, resume } from "./index";

/**
 * The storage key, spelled out rather than imported.
 *
 * Only the tests that plant a record a *different* version of the package
 * wrote need it, and those are exactly the tests that must not be written in
 * terms of what this version would produce. Everywhere else the record is
 * observed through `resume()`, which is the only thing a caller can see.
 */
const STORAGE_KEY = "catena-connect.pending";

/** How long a record stays resumable, plus enough to be past it. */
const WELL_PAST_EXPIRY_MS = 31 * 60 * 1000;

let origins = 0;
function nextInvite(): { origin: string; inviteUrl: string } {
  origins += 1;
  const origin = `https://connect-redirect-${origins}.example.com`;
  return { origin, inviteUrl: `${origin}/i/abc123` };
}

function surfaceHost(): Element | null {
  return (
    [...document.body.children].find((el) => el.shadowRoot !== null) ?? null
  );
}

function continueButton(): HTMLButtonElement | null {
  return surfaceHost()?.shadowRoot?.querySelector("button") ?? null;
}

function probeFrame(): HTMLIFrameElement | null {
  return document.body.querySelector("iframe");
}

/** Answer the probe as the page on the connect origin would. */
async function answerProbe(origin: string, supported: boolean): Promise<void> {
  const event = new MessageEvent("message", {
    data: {
      source: "catena-connect",
      version: "1",
      event: "probe",
      payload: { supported },
    },
    origin,
  });
  Object.defineProperty(event, "source", {
    value: probeFrame()?.contentWindow,
    configurable: true,
  });
  window.dispatchEvent(event);
  await vi.advanceTimersByTimeAsync(0);
}

/**
 * A stand-in for the window the browser hands back, carrying the three
 * members the package touches.
 */
function fakeWindow(): Window {
  const win = { closed: false, close: vi.fn(), focus: vi.fn() };
  return win as unknown as Window;
}

const realLocation = window.location;

/**
 * Take the tab's navigation, because jsdom implements none.
 *
 * The whole `location` is replaced rather than its method spied on: jsdom
 * defines `assign` as non-configurable, so there is nothing to redefine in
 * place.
 */
function takeNavigation(): ReturnType<typeof vi.fn> {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign },
  });
  return assign;
}

/**
 * Storage that reads and clears normally but refuses every write.
 *
 * The quota case, which is the one that can leave an earlier record standing
 * under a key a new write just failed to replace.
 */
function refuseWrites(): void {
  const real = window.sessionStorage;
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => real.getItem(key),
      removeItem: (key: string) => {
        real.removeItem(key);
      },
      setItem: () => {
        throw new Error("quota exceeded");
      },
    },
  });
}

/**
 * Storage that reads normally but refuses to clear.
 *
 * The partial failure: the record can be found but not consumed, so anything
 * that reports an outcome on the strength of having read it would report the
 * same one again on the next call.
 */
function refuseClears(): void {
  const real = window.sessionStorage;
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => real.getItem(key),
      setItem: (key: string, value: string) => {
        real.setItem(key, value);
      },
      removeItem: () => {
        throw new Error("cannot clear");
      },
    },
  });
}

/** Storage that throws wherever it is touched. */
function breakStorage(onGetter: boolean): void {
  const thrower = (): never => {
    throw new Error("storage is disabled");
  };
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    // A locked-down context throws on the property access itself, not only
    // on the call. Both shapes are real, so both are covered.
    ...(onGetter
      ? { get: thrower }
      : { value: { getItem: thrower, setItem: thrower, removeItem: thrower } }),
  });
}

const realStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage"
) as PropertyDescriptor;

const handles: Array<{ destroy(): void }> = [];

/** Run a launch all the way to the browser refusing its window. */
async function launchIntoRedirect(
  callbacks: ConnectCallbacks = {}
): Promise<{ assign: ReturnType<typeof vi.fn>; origin: string }> {
  const assign = takeNavigation();
  vi.spyOn(window, "open").mockReturnValue(null);
  const { origin, inviteUrl } = nextInvite();
  handles.push(open({ inviteUrl, embedKey: "pk_test", ...callbacks }));

  await answerProbe(origin, false);
  continueButton()?.click();

  return { assign, origin };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});

afterEach(() => {
  while (handles.length > 0) handles.pop()?.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
  Object.defineProperty(window, "sessionStorage", realStorageDescriptor);
  window.sessionStorage.clear();
  document.body.replaceChildren();
});

describe("a window the browser refused", () => {
  it("takes this tab to the flow instead", async () => {
    const { assign } = await launchIntoRedirect();

    expect(assign).toHaveBeenCalledTimes(1);
    const [url] = assign.mock.calls[0] as [string];
    expect(url.startsWith("https://connect-redirect-")).toBe(true);
    expect(url).toContain("embed=redirect");
    expect(url).toContain("embed_key=pk_test");
  });

  it("emits no dismissal on the way out", async () => {
    // It would arrive on a page about to be destroyed, and then arrive a
    // second time on resume — so a caller's teardown handler would run
    // twice for one launch, which is the bug this package exists to stop
    // every caller from writing independently.
    const onClose = vi.fn();
    const onExit = vi.fn();
    await launchIntoRedirect({ onClose, onExit });

    expect(onClose).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("starts nothing it cannot finish", async () => {
    // No window means nothing to watch. A watchdog here would poll a window
    // that does not exist and then end a launch that is mid-navigation.
    await launchIntoRedirect();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts nothing while there is no window to accept it from", async () => {
    // The source guard has nothing to match against once the launch has
    // redirected, which is what keeps an unrelated message from the right
    // origin out.
    const onOpen = vi.fn();
    const { origin } = await launchIntoRedirect({ onOpen });

    const message = new MessageEvent("message", {
      data: { source: "catena-connect", version: "1", event: "open" },
      origin,
    });
    Object.defineProperty(message, "source", {
      value: fakeWindow(),
      configurable: true,
    });
    window.dispatchEvent(message);

    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("a window handed back already closed", () => {
  // Some blockers answer `window.open` with a handle that is already closed
  // rather than with `null`. It is the same refusal, so it takes the same
  // path, record and all.

  async function launchIntoClosedWindow(
    callbacks: ConnectCallbacks = {}
  ): Promise<ReturnType<typeof vi.fn>> {
    const assign = takeNavigation();
    const popup = { closed: true, close: vi.fn(), focus: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test", ...callbacks }));

    await answerProbe(origin, false);
    continueButton()?.click();

    return assign;
  }

  it("takes this tab to the flow, as a refused window does", async () => {
    const assign = await launchIntoClosedWindow();

    expect(assign).toHaveBeenCalledTimes(1);
    const [url] = assign.mock.calls[0] as [string];
    expect(url).toContain("embed=redirect");
    expect(url).toContain("embed_key=pk_test");
  });

  it("emits no dismissal, then or later", async () => {
    // Taken for a window, the watchdog would have reported the close within
    // half a second, with no outcome and the redirect never run.
    const onClose = vi.fn();
    await launchIntoClosedWindow({ onClose });

    vi.advanceTimersByTime(5000);

    expect(onClose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("writes the record resume() reports from", async () => {
    await launchIntoClosedWindow();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    resume({ outcome: "success", onSuccess, onClose });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: [] });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("resuming a redirected launch", () => {
  it("reports success with an empty identifier list, then the dismissal", async () => {
    // Empty is the contract's own case, not a degraded one: nothing survives
    // a full-page navigation to carry the identifiers, and the connection
    // webhooks are the record on every path.
    await launchIntoRedirect();
    const order: string[] = [];
    const onSuccess = vi.fn(() => order.push("success"));
    const onClose = vi.fn(() => order.push("close"));

    resume({ outcome: "success", onSuccess, onClose });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: [] });
    expect(order).toEqual(["success", "close"]);
  });

  it("reports an exit, then the dismissal", async () => {
    await launchIntoRedirect();
    const order: string[] = [];
    const onExit = vi.fn(() => order.push("exit"));
    const onClose = vi.fn(() => order.push("close"));

    resume({ outcome: "exit", onExit, onClose });

    // No reason is forwarded: the app reports one over a channel redirect
    // mode does not have, and inventing a string would put words it never
    // said into the caller's logs.
    expect(onExit).toHaveBeenCalledWith({ reason: "" });
    expect(order).toEqual(["exit", "close"]);
  });

  it("delivers the dismissal even when the outcome callback throws", async () => {
    // On the other two modes these arrive as separate messages, so a handler
    // that throws takes itself down and nothing else. A caller writes one
    // set of handlers for all three, so this mode owes them the same.
    await launchIntoRedirect();
    const onSuccess = vi.fn(() => {
      throw new Error("the caller's handler broke");
    });
    const onClose = vi.fn();

    // The exception is still theirs to see — this orders the two callbacks,
    // it does not swallow anything.
    expect(() => resume({ outcome: "success", onSuccess, onClose })).toThrow(
      "the caller's handler broke"
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("emits nothing the second time, because the record is spent", async () => {
    await launchIntoRedirect();
    resume({ outcome: "success" });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    resume({ outcome: "success", onSuccess, onClose });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("emits nothing on a page reached by an ordinary route", () => {
    // A caller is expected to leave the call in place on a destination page
    // that has other ways in. No launch ran, so there is nothing to report
    // and nothing to throw about.
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    expect(() =>
      resume({ outcome: "success", onSuccess, onClose })
    ).not.toThrow();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("emits nothing once the record has expired, and clears it", async () => {
    await launchIntoRedirect();
    vi.advanceTimersByTime(WELL_PAST_EXPIRY_MS);
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
    // Cleared rather than left to be found again by a later call.
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("reports nothing rather than an outcome it could not consume", async () => {
    // The record was read but could not be cleared. Reporting on the strength
    // of the read alone would deliver the same outcome again on the next call
    // — and a reload of the destination page is enough to make that call.
    // Losing the callback is a position the contract already describes;
    // announcing one completed connection twice is not.
    await launchIntoRedirect();
    refuseClears();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    resume({ outcome: "success", onSuccess, onClose });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("discards a record whose expiry could never arrive", () => {
    // `1e309` parses as `Infinity`, which outlives every comparison made
    // against it. A record carrying one would stay resumable for the life of
    // the tab, which is the single value that defeats having an expiry.
    window.sessionStorage.setItem(
      STORAGE_KEY,
      '{"schema":"catena-connect.pending/1","id":"forever","expires":1e309}'
    );
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("discards a record whose schema marker it does not recognize", () => {
    // A record a future version of the package wrote. It is discarded, not
    // parsed — which is the whole reason the marker is checked first.
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schema: "catena-connect.pending/99",
        id: "x",
        expires: Date.now() + 60_000,
      })
    );
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("discards a record it cannot read at all", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "not json");
    const onSuccess = vi.fn();

    expect(() => resume({ outcome: "success", onSuccess })).not.toThrow();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("emits nothing after a launch that ran in a frame", async () => {
    // The record is written on redirect mode and nowhere else. A framed
    // launch that already delivered its events over the message channel must
    // not produce a second set on the caller's next page load.
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await answerProbe(origin, true);
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("emits nothing after a launch that ran in a window", async () => {
    vi.spyOn(window, "open").mockReturnValue(fakeWindow());
    const { origin, inviteUrl } = nextInvite();
    handles.push(open({ inviteUrl, embedKey: "pk_test" }));
    await answerProbe(origin, false);
    continueButton()?.click();
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("emits nothing for a launch torn down before its navigation took", async () => {
    // A navigation is not instant, and a caller's component can unmount in
    // the moment before it lands. That launch is never coming back, so its
    // record must not outlive it and announce an outcome later.
    await launchIntoRedirect();
    handles.pop()?.destroy();
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("leaves a record it did not write alone when a launch is torn down", async () => {
    // A navigation is not instant, so a teardown can run after the record it
    // means to clear has already been replaced. It clears the one its own
    // launch wrote and nothing else — the record here stands in for one
    // written after this launch redirected.
    await launchIntoRedirect();
    const later = JSON.stringify({
      schema: "catena-connect.pending/1",
      id: "written-by-another-launch",
      expires: Date.now() + 60_000,
    });
    window.sessionStorage.setItem(STORAGE_KEY, later);

    handles.pop()?.destroy();

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(later);
  });

  it("consumes a live record when called on any same-origin page, not just the destination", async () => {
    // The honest shape of the contract, asserted so it cannot drift back to
    // the stronger claim. The record says nothing about which page the flow
    // returned to, so a resume inside the window reports the launch wherever
    // it is called from. A caller puts the call on their two destination
    // pages and nowhere else; the package cannot enforce that for them.
    await launchIntoRedirect();
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("leaves the record for a later call when the outcome is not recognized", async () => {
    // A call that cannot report anything must not spend the launch a correct
    // one would have reported — the outcome is checked before the record is
    // touched.
    await launchIntoRedirect();
    resume({ outcome: "sucess" as "success" });
    const onSuccess = vi.fn();

    resume({ outcome: "success", onSuccess });

    expect(onSuccess).toHaveBeenCalledWith({ connectionIds: [] });
  });

  it("emits nothing for an outcome it does not recognize", async () => {
    // Untyped JavaScript, and a typo. Guessing between the two outcomes
    // would tell a caller a flow failed that succeeded.
    await launchIntoRedirect();
    const onSuccess = vi.fn();
    const onExit = vi.fn();
    const onClose = vi.fn();

    resume({
      outcome: "sucess" as "success",
      onSuccess,
      onExit,
      onClose,
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("storage the browser will not let us touch", () => {
  it("navigates anyway when the record cannot be written", async () => {
    // The user completing the flow matters more than the callback. Losing
    // the resumable outcome puts the caller exactly where one who never
    // calls `resume()` already is.
    breakStorage(false);

    const { assign } = await launchIntoRedirect();

    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("navigates anyway when storage cannot even be reached", async () => {
    breakStorage(true);

    const { assign } = await launchIntoRedirect();

    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("clears a record it could not replace, rather than leaving it to be resumed", async () => {
    // A refused write leaves whatever was already under the key in place.
    // That record would be found by the resume on the far side of this
    // navigation and reported as this launch's outcome — a flow the user
    // may have walked away from, announced as the one they just finished.
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schema: "catena-connect.pending/1",
        id: "an-earlier-launch",
        expires: Date.now() + 60_000,
      })
    );
    refuseWrites();

    const { assign } = await launchIntoRedirect();
    const onSuccess = vi.fn();
    resume({ outcome: "success", onSuccess });

    // The tab still goes: the user completing the flow outranks the
    // callback. It is the callback that is given up, not the launch.
    expect(assign).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("resumes without throwing when the record cannot be read", () => {
    breakStorage(false);
    const onSuccess = vi.fn();

    expect(() => resume({ outcome: "success", onSuccess })).not.toThrow();

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("resumes without throwing when storage cannot even be reached", () => {
    breakStorage(true);
    const onSuccess = vi.fn();

    expect(() => resume({ outcome: "success", onSuccess })).not.toThrow();

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("tears a redirected launch down without throwing", async () => {
    // The teardown clears the record, and a cleanup that throws takes the
    // rest of the teardown with it — the surface would stay on the page and
    // the launch slot would stay pinned.
    breakStorage(false);
    await launchIntoRedirect();

    expect(() => handles.pop()?.destroy()).not.toThrow();
  });
});
