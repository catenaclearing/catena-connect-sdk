/**
 * The contract between this package and the connect app, as one importable
 * surface. For the app's integration tests, not for callers.
 *
 * The two live in separate repositories, and for a release each one's suite
 * tested its own copy of what the other sends: the parser here read a key the
 * app never wrote, the app accepted a mode this package never named, and both
 * were green. This entry exists so the app can run its real output through
 * this package's real parser and URL builder in one test, and type what it
 * posts against what is read here.
 *
 * Outside the compatibility rules in the README. Callers have no reason to
 * import it; the app's tests are its only consumer, and it may change in a
 * minor release when the contract does.
 *
 * `PROBE_BUDGET_MS` is here for one assertion: the probe page caps its own round
 * trip and this package waits for it, so the app can check that its cap fits
 * inside what is waited for. That wait starts at the page's `load` event, so
 * the document's own delivery is not part of it; `PROBE_LOAD_BUDGET_MS` is how
 * long that delivery may take. That is the one coupling between the two that
 * no type expresses.
 *
 * `@catenaclearing/connect-sdk/contract`
 */

import { type Listener, listen, type MessageRouting } from "./messages";
import { buildLaunchUrl, connectOrigin, withEmbedMode } from "./url";
import {
  BRAND_COLOR_PARAM,
  BRAND_LOGO_DARK_PARAM,
  BRAND_LOGO_PARAM,
  CONTRACT_VERSION,
  EMBED_FRAME,
  EMBED_KEY_PARAM,
  EMBED_PARAM,
  EMBED_POPUP,
  EMBED_REDIRECT,
  type EmbedMode,
  EVENT_CLOSE,
  EVENT_CONNECTION,
  EVENT_CONNECTION_DELETED,
  EVENT_EXIT,
  EVENT_OPEN,
  EVENT_PROBE,
  EVENT_SUCCESS,
  MESSAGE_SOURCE,
  PROBE_PATH,
  THEME_PARAM,
  VARIANT_PARAM,
} from "./wire";

export {
  BUDGET_MS as PROBE_BUDGET_MS,
  LOAD_BUDGET_MS as PROBE_LOAD_BUDGET_MS,
} from "./probe";

export {
  BRAND_COLOR_PARAM,
  BRAND_LOGO_DARK_PARAM,
  BRAND_LOGO_PARAM,
  buildLaunchUrl,
  CONTRACT_VERSION,
  connectOrigin,
  EMBED_FRAME,
  EMBED_KEY_PARAM,
  EMBED_PARAM,
  EMBED_POPUP,
  EMBED_REDIRECT,
  type EmbedMode,
  EVENT_CLOSE,
  EVENT_CONNECTION,
  EVENT_CONNECTION_DELETED,
  EVENT_EXIT,
  EVENT_OPEN,
  EVENT_PROBE,
  EVENT_SUCCESS,
  type Listener,
  listen,
  MESSAGE_SOURCE,
  type MessageRouting,
  PROBE_PATH,
  THEME_PARAM,
  VARIANT_PARAM,
  withEmbedMode,
};

/** What every message from the app carries, before anything else. */
export interface MessageStamp {
  source: typeof MESSAGE_SOURCE;
  version: typeof CONTRACT_VERSION;
}

/**
 * A completion, exactly as the app posts it.
 *
 * The detail sits beside `event`, not under a key of its own. This is the
 * shape the app's integration document tells a raw `postMessage` consumer to
 * read, which is what froze it. A builder typed as returning this cannot nest
 * the detail without failing to compile.
 */
export type CompletionMessage =
  | (MessageStamp & { event: typeof EVENT_OPEN })
  | (MessageStamp & { event: typeof EVENT_CONNECTION; connectionId: string })
  | (MessageStamp & {
      event: typeof EVENT_CONNECTION_DELETED;
      connectionId: string;
    })
  | (MessageStamp & { event: typeof EVENT_SUCCESS; connectionIds: string[] })
  | (MessageStamp & { event: typeof EVENT_EXIT; reason: string })
  | (MessageStamp & { event: typeof EVENT_CLOSE });

/**
 * The probe's verdict, exactly as the probe page posts it.
 *
 * The one message that nests. New messages are flat, as a completion is; this
 * is the documented exception rather than the pattern.
 */
export interface ProbeMessage extends MessageStamp {
  event: typeof EVENT_PROBE;
  payload: { supported: boolean };
}
