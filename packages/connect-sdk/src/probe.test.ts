import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectPartitionedCookies, resolvedVerdict } from "./probe";

/**
 * A fresh origin for every test.
 *
 * The verdict cache lives for the life of the page, which is exactly what a
 * page does and what the tests should not fight. Giving each test its own
 * origin keeps them independent without module resets, and exercises the
 * per-origin keying while it is at it. The tests about the embed key reuse
 * one origin on purpose, because the key is what they vary.
 */
let origins = 0;
function nextOrigin(): string {
  origins += 1;
  return `https://connect-${origins}.example.com`;
}

/** The hidden frame the probe mounted. It is the only one in the body. */
function probeFrame(): HTMLIFrameElement | null {
  return document.body.querySelector("iframe");
}

/**
 * Deliver a message as the browser would.
 *
 * `source` is assigned rather than passed to the constructor because jsdom
 * will not accept an arbitrary object as a `WindowProxy` in
 * `MessageEventInit`. The guard reads the property, so assigning it
 * exercises the same path.
 *
 * What this does not prove: jsdom delivers a `postMessage` whatever its
 * target origin says, so arriving here only shows our handler ran. The
 * addressing claims are verified in a real browser.
 */
function deliver(init: {
  origin: string;
  source?: Window | null;
  data?: unknown;
}): void {
  const event = new MessageEvent("message", {
    data: init.data,
    origin: init.origin,
  });
  Object.defineProperty(event, "source", {
    value: init.source === undefined ? null : init.source,
    configurable: true,
  });
  window.dispatchEvent(event);
}

/** A well-formed verdict, which each guard test then spoils in one way. */
function verdict(supported: unknown): unknown {
  return {
    source: "catena-connect",
    version: "1",
    event: "probe",
    payload: { supported },
  };
}

/**
 * Start a probe and answer it from its own frame, the way the page on the
 * connect origin would.
 */
function answer(
  origin: string,
  data: unknown,
  embedKey?: string
): Promise<string> {
  const pending = detectPartitionedCookies(origin, embedKey);
  deliver({ origin, source: probeFrame()?.contentWindow, data });
  return pending;
}

/** Let the budget run out, which is how a silenced probe settles. */
async function exhaustBudget(): Promise<void> {
  await vi.advanceTimersByTimeAsync(2500);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("confirming the round trip", () => {
  it("resolves supported when the frame confirms the cookie came back", async () => {
    // The control. Every silence assertion below is only meaningful because
    // this one passes: without it, a broken harness and a working guard are
    // indistinguishable.
    await expect(answer(nextOrigin(), verdict(true))).resolves.toBe(
      "supported"
    );
  });

  it("resolves unsupported when the frame reports the cookie did not", async () => {
    await expect(answer(nextOrigin(), verdict(false))).resolves.toBe(
      "unsupported"
    );
  });

  it("takes nothing short of a positive confirmation as one", async () => {
    // A merely truthy value is not the confirmation this is allowed to act
    // on. Cookie visibility is the case this exists to exclude: a cookie can
    // be readable by the document and still be withheld from cross-site
    // requests, so only the round trip's own verdict counts.
    for (const claimed of ["true", 1, {}, [], "yes"]) {
      await expect(answer(nextOrigin(), verdict(claimed))).resolves.toBe(
        "unsupported"
      );
    }
  });
});

describe("the three guards", () => {
  it("ignores a verdict from another origin", async () => {
    const origin = nextOrigin();
    const pending = detectPartitionedCookies(origin);

    deliver({
      origin: "https://attacker.example.com",
      source: probeFrame()?.contentWindow,
      data: verdict(true),
    });
    await exhaustBudget();

    expect(await pending).toBe("unsupported");
  });

  it("ignores a verdict from a window this probe did not create", async () => {
    const origin = nextOrigin();
    const pending = detectPartitionedCookies(origin);

    deliver({ origin, source: {} as Window, data: verdict(true) });
    await exhaustBudget();

    expect(await pending).toBe("unsupported");
  });

  it("ignores a payload without our source marker", async () => {
    // Defeats unrelated traffic from our own origin, which the origin and
    // window checks cannot: both of those pass for it.
    const origin = nextOrigin();
    const pending = detectPartitionedCookies(origin);

    deliver({
      origin,
      source: probeFrame()?.contentWindow,
      data: { version: "1", event: "probe", payload: { supported: true } },
    });
    await exhaustBudget();

    expect(await pending).toBe("unsupported");
  });

  it("ignores a message that is not a verdict", async () => {
    const origin = nextOrigin();
    const pending = detectPartitionedCookies(origin);

    deliver({
      origin,
      source: probeFrame()?.contentWindow,
      data: { source: "catena-connect", event: "open", payload: {} },
    });
    await exhaustBudget();

    expect(await pending).toBe("unsupported");
  });
});

describe("failing closed", () => {
  it("resolves unsupported when the budget runs out", async () => {
    // Everything that ends with the frame never answering: a blocked
    // request, a frame that does not load, a page that throws before it
    // reports.
    const origin = nextOrigin();
    const pending = detectPartitionedCookies(origin);

    await exhaustBudget();

    expect(await pending).toBe("unsupported");
  });

  it("never rejects, whatever arrives", async () => {
    const origin = nextOrigin();
    const pending = detectPartitionedCookies(origin);
    const frame = probeFrame()?.contentWindow;

    for (const data of [undefined, null, "", 0, [], { source: null }]) {
      deliver({ origin, source: frame, data });
    }
    await exhaustBudget();

    await expect(pending).resolves.toBe("unsupported");
  });

  it("resolves unsupported when the probe cannot even be set up", async () => {
    // A page that calls `open()` from a script in its head has no
    // `document.body` to append to. Whatever the cause, there is no round
    // trip on its way, which is the answer this already has a name for.
    const append = vi.spyOn(document.body, "append").mockImplementation(() => {
      throw new TypeError("no body to append to");
    });

    await expect(detectPartitionedCookies(nextOrigin())).resolves.toBe(
      "unsupported"
    );

    append.mockRestore();
  });

  it("does not wedge the page when setting the probe up fails", async () => {
    // The failure that matters more than the first one: a rejection
    // escaping would leave the origin in flight forever and hand every
    // later launch the same rejected promise.
    const origin = nextOrigin();
    const append = vi.spyOn(document.body, "append").mockImplementation(() => {
      throw new TypeError("no body to append to");
    });

    await detectPartitionedCookies(origin);
    append.mockRestore();

    // Nothing is pinned in flight: the next call is a fresh probe settling
    // on its own budget, rather than a rejected promise held over from the
    // first and handed to every launch after it.
    const second = detectPartitionedCookies(origin);
    await exhaustBudget();

    await expect(second).resolves.toBe("unsupported");
  });

  it("remembers nothing from a probe that never went out", async () => {
    // A setup failure is not evidence about the origin — the frame never
    // reached the page. Remembering it would put a page that merely asked
    // too early on the fallback for the rest of its life, which is the one
    // direction this cannot afford to be wrong in.
    const origin = nextOrigin();
    const append = vi.spyOn(document.body, "append").mockImplementation(() => {
      throw new TypeError("no body to append to");
    });

    await expect(detectPartitionedCookies(origin)).resolves.toBe("unsupported");
    append.mockRestore();

    expect(resolvedVerdict(origin)).toBeNull();
  });

  it("measures again once there is somewhere to measure from", async () => {
    // The point of forgetting it: the next caller gets a real round trip
    // rather than an answer nobody ever established.
    const origin = nextOrigin();
    const append = vi.spyOn(document.body, "append").mockImplementation(() => {
      throw new TypeError("no body to append to");
    });
    await detectPartitionedCookies(origin);
    append.mockRestore();

    const second = detectPartitionedCookies(origin);
    expect(probeFrame()).not.toBeNull();
    deliver({
      origin,
      source: probeFrame()?.contentWindow,
      data: verdict(true),
    });

    await expect(second).resolves.toBe("supported");
    expect(resolvedVerdict(origin)).toBe("supported");
  });

  it("still remembers a verdict the browser did give it", async () => {
    // The control for the two above: a budget that ran out is the browser
    // answering, not a probe that never ran, and it is cached like any
    // other measurement.
    const origin = nextOrigin();

    const pending = detectPartitionedCookies(origin);
    await exhaustBudget();
    await pending;

    expect(resolvedVerdict(origin)).toBe("unsupported");
  });

  it("leaves no listener or timer behind when setup fails", async () => {
    const append = vi.spyOn(document.body, "append").mockImplementation(() => {
      throw new TypeError("no body to append to");
    });

    await detectPartitionedCookies(nextOrigin());
    append.mockRestore();

    // Nothing left pending: the budget timer was cleared on the way out.
    expect(vi.getTimerCount()).toBe(0);
    expect(probeFrame()).toBeNull();
  });

  it("does not hang when nothing ever arrives", async () => {
    const pending = detectPartitionedCookies(nextOrigin());

    await exhaustBudget();

    await expect(pending).resolves.toBeDefined();
  });
});

describe("the frame it probes from", () => {
  it("points at the probe page on the connect origin", () => {
    const origin = nextOrigin();
    detectPartitionedCookies(origin);

    // The round trip has to be measured in the context frame mode will use,
    // not in the host page.
    expect(probeFrame()?.src).toBe(`${origin}/embed/probe`);
  });

  it("is hidden while it runs", () => {
    detectPartitionedCookies(nextOrigin());

    const frame = probeFrame();
    expect(frame?.style.display).toBe("none");
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stays hidden against a host page that restyles every frame", () => {
    // This frame is in the host document, not behind the surface's
    // shadow root, so their rules match it. An `iframe { display: block
    // !important }` would otherwise show a blank frame in their layout for
    // as long as the probe runs. Inline importance is what an author rule
    // cannot outrank.
    detectPartitionedCookies(nextOrigin());

    expect(probeFrame()?.style.getPropertyPriority("display")).toBe(
      "important"
    );
  });

  it("is removed once the verdict arrives", async () => {
    await answer(nextOrigin(), verdict(true));

    expect(probeFrame()).toBeNull();
  });

  it("is removed when the budget runs out instead", async () => {
    const pending = detectPartitionedCookies(nextOrigin());

    await exhaustBudget();
    await pending;

    expect(probeFrame()).toBeNull();
  });
});

describe("holding the verdict for the life of the page", () => {
  it("reuses the answer without mounting a second frame", async () => {
    const origin = nextOrigin();
    await answer(origin, verdict(true));

    await expect(detectPartitionedCookies(origin)).resolves.toBe("supported");
    expect(probeFrame()).toBeNull();
  });

  it("shares one probe between callers that arrive together", async () => {
    const origin = nextOrigin();
    const first = detectPartitionedCookies(origin);
    const second = detectPartitionedCookies(origin);

    expect(document.body.querySelectorAll("iframe")).toHaveLength(1);

    deliver({
      origin,
      source: probeFrame()?.contentWindow,
      data: verdict(true),
    });

    expect(await first).toBe("supported");
    expect(await second).toBe("supported");
  });

  it("does not answer for an origin it never measured", async () => {
    const measured = nextOrigin();
    await answer(measured, verdict(true));

    // A verdict is evidence about one origin. Reusing it for another would
    // be the stale-`supported` failure by a different route.
    expect(resolvedVerdict(measured)).toBe("supported");
    expect(resolvedVerdict(nextOrigin())).toBeNull();
  });

  it("reports nothing before a probe has finished", async () => {
    const origin = nextOrigin();
    const pending = detectPartitionedCookies(origin);

    expect(resolvedVerdict(origin)).toBeNull();

    deliver({
      origin,
      source: probeFrame()?.contentWindow,
      data: verdict(true),
    });
    await pending;

    expect(resolvedVerdict(origin)).toBe("supported");
  });

  it("persists the verdict nowhere", async () => {
    // Settings and browsers change between sessions, and a stale
    // `supported` strands a user in a frame that no longer works.
    await answer(nextOrigin(), verdict(true));

    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });
});

describe("carrying the embed key", () => {
  // The app lets only a key's registered origins frame a probe that names
  // the key, so the verdict now depends on it. On an origin the key does not
  // cover the probe goes unanswered and settles unsupported, which puts the
  // user on the window instead of a frame the browser would refuse to show.

  it("names the key on the probe URL when it has one", () => {
    const origin = nextOrigin();
    detectPartitionedCookies(origin, "pk_test");

    const src = new URL(probeFrame()?.src ?? "");
    expect(src.origin + src.pathname).toBe(`${origin}/embed/probe`);
    expect(src.searchParams.get("embed_key")).toBe("pk_test");
  });

  it("sends the key exactly as given", () => {
    // Forwarded unvalidated, as the launch URL forwards it: the app is the
    // one that resolves it.
    const origin = nextOrigin();
    detectPartitionedCookies(origin, "pk test&embed=x");

    const src = new URL(probeFrame()?.src ?? "");
    expect(src.searchParams.get("embed_key")).toBe("pk test&embed=x");
    expect(src.searchParams.has("embed")).toBe(false);
  });

  it("carries no key parameter when it was given none", () => {
    // Keyless, the app keeps the probe frameable from anywhere, which is the
    // behavior a page that warms without a key has always had.
    const origin = nextOrigin();
    detectPartitionedCookies(origin);

    expect(probeFrame()?.src).toBe(`${origin}/embed/probe`);
  });

  it("does not hand a keyless verdict to a launch with a key", async () => {
    const origin = nextOrigin();
    await answer(origin, verdict(true));

    expect(resolvedVerdict(origin)).toBe("supported");
    expect(resolvedVerdict(origin, "pk_test")).toBeNull();

    // The keyed launch measures for itself rather than inheriting a
    // `supported` the app may not grant this key.
    const keyed = detectPartitionedCookies(origin, "pk_test");
    expect(probeFrame()).not.toBeNull();
    await exhaustBudget();

    await expect(keyed).resolves.toBe("unsupported");
    expect(resolvedVerdict(origin)).toBe("supported");
  });

  it("does not hand one key's verdict to another", async () => {
    const origin = nextOrigin();
    await answer(origin, verdict(true), "pk_a");

    expect(resolvedVerdict(origin, "pk_a")).toBe("supported");
    expect(resolvedVerdict(origin, "pk_b")).toBeNull();

    detectPartitionedCookies(origin, "pk_b");
    const src = new URL(probeFrame()?.src ?? "");
    expect(src.searchParams.get("embed_key")).toBe("pk_b");
  });

  it("reuses a verdict for the same origin and key", async () => {
    const origin = nextOrigin();
    await answer(origin, verdict(true), "pk_test");

    await expect(detectPartitionedCookies(origin, "pk_test")).resolves.toBe(
      "supported"
    );
    expect(probeFrame()).toBeNull();
  });

  it("shares a running probe only between callers with the same key", async () => {
    const origin = nextOrigin();
    const first = detectPartitionedCookies(origin, "pk_a");
    const same = detectPartitionedCookies(origin, "pk_a");
    expect(document.body.querySelectorAll("iframe")).toHaveLength(1);

    const other = detectPartitionedCookies(origin, "pk_b");
    const keyless = detectPartitionedCookies(origin);
    const frames = [...document.body.querySelectorAll("iframe")];
    expect(frames).toHaveLength(3);
    expect(
      frames.map((f) => new URL(f.src).searchParams.get("embed_key"))
    ).toEqual(["pk_a", "pk_b", null]);

    // Each frame's answer settles its own probe and no other.
    deliver({ origin, source: frames[0]?.contentWindow, data: verdict(true) });
    deliver({ origin, source: frames[1]?.contentWindow, data: verdict(false) });
    await exhaustBudget();

    expect(await first).toBe("supported");
    expect(await same).toBe("supported");
    expect(await other).toBe("unsupported");
    expect(await keyless).toBe("unsupported");
  });

  it("keeps a missing key and an empty one apart", async () => {
    const origin = nextOrigin();
    await answer(origin, verdict(true));

    expect(resolvedVerdict(origin, "")).toBeNull();
  });
});
