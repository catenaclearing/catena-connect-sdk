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
 * A refused cookie, a failed request, a frame that never loaded, an exhausted
 * budget: all of those are the browser answering, and worth remembering.
 *
 * A probe that could not be set up is not. Nothing left the page, so nothing
 * was learned about this origin, and the cause is usually *when* it was called
 * rather than the browser. Caching it would put a page that merely warmed too
 * early on the fallback for the rest of its life.
 */
interface ProbeResult {
  verdict: ProbeVerdict;
  measured: boolean;
}

/**
 * The budget for the whole round trip, and the only thing that guarantees a
 * verdict at all.
 *
 * Nothing else here reports failure. A frame that is refused, never loads, or
 * throws before reporting posts no message, and a cross-origin frame exposes
 * no load or error signal worth reading instead — so without this timer a
 * launch would sit on its loading state forever, with no frame, no affordance
 * and no event. Giving up costs one extra click; not giving up costs the
 * launch.
 *
 * The floor is set on the other side. The probe page caps its own round trip
 * and reports what it found, so this has to outlast that cap plus the document
 * load in front of it. Too tight and the timer here pre-empts a verdict that
 * was already on its way, and records the browser as unsupported for the rest
 * of the page's life.
 *
 * The headroom is deliberately generous, because it is only ever spent by a
 * launch that is already going badly. A browser that simply refuses the cookie
 * is answered promptly on its own merits and never reaches this timer.
 */
export const BUDGET_MS = 2500;

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

    // Measured unless a caller says otherwise: every settle below but one is
    // the browser answering.
    const settle = (verdict: ProbeVerdict, measured = true): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve({ verdict, measured });
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

      // Covers every way the frame can fail to answer: a blocked request, a
      // frame that never loads, a page that throws before reporting. None of
      // them need their own branch.
      timer = setTimeout(() => settle("unsupported"), BUDGET_MS);

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
