/**
 * Every literal the connect app's contract owns, in one place.
 *
 * When the app changes its parameter names or message shape, this is the only
 * file that changes with it.
 */

/**
 * How the caller's product opened the flow, spelled the way the app spells it.
 *
 * Set when the mode is chosen rather than when the URL is built, because the
 * ladder has not decided yet at that point.
 *
 * The app reads this to pick the session cookie attributes, so a value that
 * does not match the context it names is not a cosmetic error. A framed run is
 * a third party and needs a partitioned cookie; a window and a redirect are
 * top-level and must not have one — Safari rejects that cookie outright, and
 * the window is the rung those browsers fall back to. One value for all three
 * cannot carry that distinction, which is why there are three.
 *
 * Absent means standalone: nobody's SDK opened it. Every launch from this
 * package names one of these.
 */
export const EMBED_PARAM = "embed";
export const EMBED_FRAME = "iframe";
export const EMBED_POPUP = "popup";
export const EMBED_REDIRECT = "redirect";

/** The three rungs, as the app's contract enumerates them. */
export type EmbedMode =
  | typeof EMBED_FRAME
  | typeof EMBED_POPUP
  | typeof EMBED_REDIRECT;

/** The caller's embed key. The app resolves it against registered origins. */
export const EMBED_KEY_PARAM = "embed_key";

/** Presentation and branding. All forwarded unvalidated. */
export const VARIANT_PARAM = "variant";
export const THEME_PARAM = "theme";
export const BRAND_LOGO_PARAM = "brand_logo";
export const BRAND_LOGO_DARK_PARAM = "brand_logo_dark";
export const BRAND_COLOR_PARAM = "brand_color";

/**
 * The prefix every flow window's name starts with. Each launch adds its own
 * suffix (`windowName()` in `modes.ts`).
 *
 * Not a fixed name, because `window.open` with a name first looks for a
 * window already carrying it, and a window left over from an earlier page,
 * one this document did not open, is one the browser will not let it
 * navigate. Chrome refuses with "Unsafe attempt to initiate navigation"
 * instead of opening the flow. Bringing an open window back never needed the
 * name: the launch holds the window it opened and focuses that.
 */
export const WINDOW_NAME = "catena-connect";

/** The payload's own source marker. Third of the three message guards. */
export const MESSAGE_SOURCE = "catena-connect";

/** The contract version this package was written against. */
export const CONTRACT_VERSION = 1;

/** The five events we recognize. Anything else is ignored. */
export const EVENT_OPEN = "open";
export const EVENT_CONNECTION = "connection";
export const EVENT_SUCCESS = "success";
export const EVENT_EXIT = "exit";
export const EVENT_CLOSE = "close";

/**
 * The envelope as the app posts it.
 *
 * Every field is `unknown` because this arrives from another origin: it is a
 * claim until checked. `version` is unconstrained so an unrecognized one
 * still delivers the events we do recognize.
 *
 * Two shapes share this type, and they differ in where the detail sits. A
 * completion carries its fields beside `event` — `connectionId` on a
 * connection, `connectionIds` on a success, `reason` on an exit — which is the
 * shape the app's own integration document
 * tells a raw `postMessage` consumer to read, and so is frozen. The probe's
 * verdict is the one message that nests, under `payload`. Reading a
 * completion's fields from `payload` finds nothing and reports an empty list
 * and an empty reason on every success and every exit; that shipped once.
 */
export interface WireEnvelope {
  source?: unknown;
  version?: unknown;
  event?: unknown;
  /** A completion's detail, flat beside the event. */
  connectionId?: unknown;
  connectionIds?: unknown;
  reason?: unknown;
  /** The probe's detail, and only the probe's. */
  payload?: unknown;
}

/**
 * The page the probe loads on the connect origin, and the verdict it reports.
 *
 * The round trip has to run in a cross-site frame on our origin, because that
 * is the context frame mode uses. Running it from the host page would
 * measure something else. The app owns this path and the cookie attributes
 * behind it.
 */
export const PROBE_PATH = "/embed/probe";
export const EVENT_PROBE = "probe";
