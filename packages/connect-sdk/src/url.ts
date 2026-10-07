/** The caller's invite URL in, the launch URL out, plus the origin we trust. */

import type { CatenaConnectOptions } from "./types";
import {
  BRAND_COLOR_PARAM,
  BRAND_LOGO_DARK_PARAM,
  BRAND_LOGO_PARAM,
  EMBED_KEY_PARAM,
  EMBED_PARAM,
  type EmbedMode,
  THEME_PARAM,
  VARIANT_PARAM,
} from "./wire";

/**
 * The hosts whose http origin is still only reachable from this machine.
 * `URL.hostname` keeps IPv6 in its brackets, so that is the form matched.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The subset of the launch options that reaches the URL. */
type LaunchParams = Pick<
  CatenaConnectOptions,
  | "inviteUrl"
  | "embedKey"
  | "variant"
  | "theme"
  | "logoUrl"
  | "logoUrlDark"
  | "brandColor"
>;

/**
 * The origin this launch trusts: for the frame, the window, and every inbound
 * message check.
 *
 * Derived from the invite URL rather than held as a constant, so testing
 * against a development environment needs no separate build and no hostname
 * of ours ends up in the published bundle.
 */
export function connectOrigin(inviteUrl: string): string {
  const url = new URL(inviteUrl);

  // An allowlist, because the bad answer here is neither rare nor obvious:
  // `URL` parses about:, data:, javascript: and file: happily and serializes
  // all of their origins to the *string* "null". Nothing throws, and we would
  // carry "null" as the origin we trust. Then the probe has no origin to be
  // built against, the launch URL is unservable, and the origin guard stops
  // discriminating because every opaque context serializes the same way.
  //
  // blob: is excluded by the same rule. Its origin looks real, but the URL
  // cannot carry the launch parameters.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError(
      "The invitation URL must be an http or https URL. The package derives " +
        "the origin it trusts from it, and no other scheme yields one."
    );
  }

  // Everything this origin is used for assumes nobody else can be it: the
  // frame we mount, the window we open, and the guard that decides an inbound
  // message is the flow reporting rather than a page pretending to. Over plain
  // http on a network someone else is on, all three are theirs for the taking
  // — they can serve the flow, post a success that was never earned, and read
  // the embed key out of the URL on the way past.
  //
  // Loopback is the exception because it has no network to be on, and it is
  // the one address a caller needs while building against a local app.
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError(
      "An http invitation URL is only accepted on localhost. Anywhere else " +
        "the origin this package trusts would be one an attacker on the " +
        "network can impersonate. Use https."
    );
  }

  return url.origin;
}

/**
 * Build the URL the flow is launched at.
 *
 * Parameters are set on the invite URL we were given, so anything it already
 * carries survives. Values are forwarded exactly as supplied.
 *
 * The mode is not among them. It is not known until the probe has answered, so
 * `withEmbedMode` names it on the way into whichever rung the ladder picked.
 */
export function buildLaunchUrl(options: LaunchParams): string {
  const url = new URL(options.inviteUrl);

  url.searchParams.set(EMBED_KEY_PARAM, options.embedKey);

  setIfGiven(url, VARIANT_PARAM, options.variant);
  setIfGiven(url, THEME_PARAM, options.theme);
  setIfGiven(url, BRAND_LOGO_PARAM, options.logoUrl);
  setIfGiven(url, BRAND_LOGO_DARK_PARAM, options.logoUrlDark);
  setIfGiven(url, BRAND_COLOR_PARAM, options.brandColor);

  return url.toString();
}

/** An omitted option is absent from the URL, not empty in it. */
function setIfGiven(url: URL, param: string, value: string | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(param, value);
  }
}

/**
 * The same launch URL, naming the mode it is about to be opened in.
 *
 * Separate from `buildLaunchUrl` because the two know their part at different
 * times: every other parameter is fixed when `open()` is called, and the mode
 * is not decided until the probe has answered.
 */
export function withEmbedMode(launchUrl: string, mode: EmbedMode): string {
  const url = new URL(launchUrl);

  url.searchParams.set(EMBED_PARAM, mode);

  return url.toString();
}
