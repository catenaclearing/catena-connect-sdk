/**
 * Can the flow run in a frame?
 *
 * A hidden frame on the connect origin performs a cookie round trip and
 * reports whether the cookie came back. Only that positive confirmation
 * yields `"supported"`; everything else is `"unsupported"`.
 *
 * Failing closed is the whole design, because the two errors cost different
 * amounts. A wrong `"unsupported"` costs one extra click. A wrong
 * `"supported"` strands the user in a frame that cannot work, with no way
 * back. So exactly one code path returns `"supported"`.
 *
 * Nothing here reads client hints or a browser-version table. The question is
 * whether this context carries the cookie, and the only way to know is to try.
 *
 * The probe carries the launch's embed key when it has one, because the app
 * lets only the key's registered origins frame a probe that names it. On an
 * origin the key does not cover, or with a key that does not resolve, the
 * real frame would be refused too. The refused probe never answers, settles
 * `"unsupported"` on its budget, and the user gets the window rather than a
 * blank frame.
 */

import {
  EMBED_KEY_PARAM,
  EVENT_PROBE,
  MESSAGE_SOURCE,
  PROBE_PATH,
  type WireEnvelope,
} from "./wire";

export type ProbeVerdict = "supported" | "unsupported";

/**
 * A verdict, and whether the round trip actually went out.
 *
 * A verdict the page reported, refused cookie included, is the browser
 * answering, and worth remembering.
 *
 * Two outcomes are not. A probe that could not be set up sent nothing, so it
 * learned nothing about this origin, and the cause is usually *when* it was
 * called rather than the browser. And a probe that ran out of time learned
 * nothing about cookies either: it says the network or the page was slow on
 * this attempt, which the next one may not be. Caching either would put the
 * page on the fallback for the rest of its life on the strength of one bad
 * moment.
 */
interface ProbeResult {
  verdict: ProbeVerdict;
  measured: boolean;
}

/**
 * How long the probe page has to arrive, from the frame going in until its
 * `load` event.
 *
 * This is the network in front of the page, and nothing about cookies. A cold
 * connection, through a corporate proxy that inspects TLS, can take seconds to
 * deliver a 3 kB document that a warm one delivers in a few hundred
 * milliseconds. With one budget for the whole probe, that first contact spent
 * all of it, the page never got to ask its question, and a browser that frames
 * the flow perfectly well was sent to the window.
 *
 * Generous because the only launch that spends it is one whose network is
 * already slow, and that launch shows its loading state either way. A user
 * waiting a few more seconds for the frame is better served than one handed a
 * window they did not need.
 */
export const LOAD_BUDGET_MS = 8000;

/**
 * How long the page has to report once it has loaded, and the only thing that
 * guarantees a verdict at all.
 *
 * Nothing else here reports failure. A frame that is refused, or a page that
 * throws before reporting, posts no message, and its `load` event says only
 * that something finished loading, refusals included. Without this timer a
 * launch would sit on its loading state forever, with no frame, no affordance
 * and no event.
 *
 * The floor is set on the other side. The probe page caps its own round trip
 * and reports what it found, so this has to outlast that cap. Too tight and
 * the timer here pre-empts a verdict that was already on its way.
 *
 * Counted from `load` rather than from the frame going in, so the document's
 * own delivery no longer comes out of it. A browser that simply refuses the
 * cookie is answered promptly on its own merits and never reaches this timer.
 *
 * Six seconds because the round trip after `load` is two requests, and on a
 * network that adds latency to every request rather than only to the first
 * contact (a TLS-inspecting proxy, or Chrome's Slow 3G profile at about two
 * seconds a request) those two alone take four. At 2.5 seconds such a browser
 * framed the flow perfectly well and was still sent to the window. The cost
 * is paid only by a frame that loads and never answers, an origin the key
 * does not cover among them, which now waits this long for its window.
 */
export const BUDGET_MS = 6000;

/**
 * What this page has already learned, and what it is still learning.
 *
 * In memory only: a persisted `"supported"` would outlive the browser or
 * setting that earned it. Keyed by origin and embed key, because that is what
 * a verdict is evidence about: whether the app lets this page frame it
 * depends on the key, so an answer measured with one key, or with none, says
 * nothing about a launch with another.
 */
const resolved = new Map<string, ProbeVerdict>();
const inFlight = new Map<string, Promise<ProbeVerdict>>();

/**
 * One cache entry per origin and key. Serialized as a pair rather than
 * concatenated, so no key can be spelled to collide with another origin's
 * entry, and a missing key stays distinct from an empty one.
 */
function cacheKey(origin: string, embedKey: string | undefined): string {
  return JSON.stringify([origin, embedKey ?? null]);
}

/**
 * The verdict this page already holds, without starting a probe to find out.
 * This is what lets a launch skip the loading state.
 */
export function resolvedVerdict(
  origin: string,
  embedKey?: string
): ProbeVerdict | null {
  return resolved.get(cacheKey(origin, embedKey)) ?? null;
}

/**
 * Resolve the verdict for this origin and key, reusing the page's answer when
 * it has one and sharing a single probe between callers that arrive together.
 *
 * Never rejects and never hangs.
 */
export function detectPartitionedCookies(
  origin: string,
  embedKey?: string
): Promise<ProbeVerdict> {
  const key = cacheKey(origin, embedKey);

  const known = resolved.get(key);
  if (known !== undefined) return Promise.resolve(known);

  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const probe = runProbe(origin, embedKey)
    // A verdict on every path. A rejection escaping here would leave this
    // entry stuck in `inFlight` and hand every later launch the same rejected
    // promise, turning one failed probe into a page that can no longer launch.
    // Unmeasured, because a probe that threw measured nothing.
    .catch((): ProbeResult => ({ verdict: "unsupported", measured: false }))
    .then(({ verdict, measured }) => {
      // This caller still fails closed on an unmeasured probe, it just does
      // not decide the question for every launch that follows. The next one
      // pays for another round trip, same as a cold page.
      if (measured) {
        resolved.set(key, verdict);
      }
      inFlight.delete(key);
      return verdict;
    });
  inFlight.set(key, probe);
  return probe;
}

/**
 * One round trip, in a frame discarded the moment it has answered. Hidden
 * rather than the real one, because committing to frame mode before knowing
 * whether it works would mean tearing down a visible frame on failure.
 */
function runProbe(
  origin: string,
  embedKey: string | undefined
): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolve) => {
    const frame = document.createElement("iframe");

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Measured unless a caller says otherwise: a reported verdict is the
    // browser answering. Running out of time and failing to set up are not.
    const settle = (verdict: ProbeVerdict, measured = true): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      frame.removeEventListener("load", onLoad);
      clearTimeout(timer);
      frame.remove();
      resolve({ verdict, measured });
    };

    // Unmeasured: the page did not answer in time, which says how slow this
    // attempt was and nothing about the cookie.
    const expire = (): void => settle("unsupported", false);

    // The document is here, so the clock restarts on what is left: the page's
    // own round trip. Once only — the frame never navigates after this, and a
    // second `load` would only hand a stalled page a second budget.
    const onLoad = (): void => {
      frame.removeEventListener("load", onLoad);
      clearTimeout(timer);
      timer = setTimeout(expire, BUDGET_MS);
    };

    const onMessage = (event: MessageEvent): void => {
      // The same three guards the flow's own messages get. This verdict
      // decides whether we use a frame at all, so a forged one is worth as
      // much care as a forged event.
      if (event.origin !== origin) return;

      const source = frame.contentWindow;
      if (source === null || event.source !== source) return;

      const envelope = asRecord(event.data) as WireEnvelope;
      if (envelope.source !== MESSAGE_SOURCE) return;
      if (envelope.event !== EVENT_PROBE) return;

      // Strictly `true`. A missing, malformed or merely truthy payload is not
      // the positive confirmation this may act on.
      settle(
        asRecord(envelope.payload).supported === true
          ? "supported"
          : "unsupported"
      );
    };

    try {
      // Not sandboxed, and not for frame mode's reason. A sandbox without
      // `allow-same-origin` gives the frame an opaque origin, which is not the
      // origin whose cookie we are asking about, so the probe would measure
      // nothing and always fail closed.
      const url = new URL(PROBE_PATH, origin);
      if (embedKey !== undefined) {
        url.searchParams.set(EMBED_KEY_PARAM, embedKey);
      }
      frame.src = url.toString();
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;

      // Important because this frame lives in the host document rather
      // than behind the surface's shadow root, so their rules match it. An
      // `iframe { display: block !important }` in host CSS would otherwise put
      // a blank frame in their layout for as long as the probe runs.
      frame.style.setProperty("display", "none", "important");

      window.addEventListener("message", onMessage);
      frame.addEventListener("load", onLoad);

      // Covers every way the page can fail to arrive: a blocked request, a
      // connection that never completes, a network too slow to finish in
      // time. Once it has arrived, `onLoad` swaps this for the shorter budget
      // that covers a page arriving but never answering.
      timer = setTimeout(expire, LOAD_BUDGET_MS);

      document.body.append(frame);
    } catch {
      // Setting the probe up is not supposed to fail, but a caller can reach
      // this from a script in the document head, where there is no
      // `document.body` to append to. Either way no round trip is on its way.
      //
      // Unmeasured: the frame never reached the page, so this says nothing
      // about the origin and everything about when it was called.
      settle("unsupported", false);
    }
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
