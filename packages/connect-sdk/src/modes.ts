/**
 * Where a resolved verdict becomes a running flow.
 *
 * Frame mode is the path nearly every user takes. The popup is the net below
 * it, for browsers that cannot carry a partitioned cookie, and the redirect is
 * the floor below that.
 */

import { writePending } from "./pending";
import { randomTail } from "./random";
import type { Surface } from "./surface";
import { WINDOW_NAME } from "./wire";

/**
 * How long a loaded frame waits for the flow's `open` before the launch gives
 * up on it and offers the window instead.
 *
 * A refused frame still fires `load`, for the browser's error page, so silence
 * after `load` is the only sign of one, and a slow page is silent too. The app
 * posts `open` from an effect after hydration, which on a slow network comes
 * seconds after `load`. Eight seconds because sending a working frame to the
 * window costs the user a flow they could have had, while waiting longer on a
 * refused one costs only a few more seconds of the loading state.
 */
export const OPEN_GRACE_MS = 8000;

/**
 * Replace whatever the surface is showing with the flow, in a frame, held
 * behind the loading state until the caller reveals it.
 *
 * Returns the frame so the caller can take its window for the message guard,
 * watch it load, and tear it down later.
 */
export function mountFrame(
  surface: Surface,
  launchUrl: string
): HTMLIFrameElement {
  surface.clear();

  // From the surface's document, which is the caller's container's and not
  // necessarily ours.
  const frame = surface.mount.ownerDocument.createElement("iframe");
  frame.className = "frame";
  frame.title = "Catena Connect";
  frame.src = launchUrl;

  // Deliberately not sandboxed. Provider consent pages cannot be framed, so
  // the flow opens a window of its own for that step; a `sandbox` without
  // `allow-popups` silently prevents it, and one carrying every token needed
  // to keep it working re-grants everything it removed. There is no security
  // to give up here either — the framed origin is ours, and the app already
  // constrains who may frame it.
  //
  // No `allow` either. Every feature a cross-origin frame is denied by
  // default would have to earn its place there, and the flow uses none.
  surface.mount.append(frame);
  surface.hold();
  return frame;
}

/** How often the watchdog checks whether the window is still there. */
const WATCHDOG_MS = 500;

/**
 * Open the flow in a window.
 *
 * **Must be called synchronously inside the user's activation handler.** An
 * `await` in between spends the activation and the browser blocks the window.
 * That failure does not reproduce in jsdom, or against an allowlisted local
 * origin. It shows up in production, against a real cross-site origin. This
 * takes a URL built beforehand so there is nothing here to wait for.
 *
 * Returns `null` when the browser refused, which is redirect mode's cue. A
 * window handed back already closed counts as a refusal: some blockers answer
 * that way instead of with `null`, and treating it as a window would start a
 * watchdog that dismisses the launch half a second later with no outcome and
 * no fallback.
 */
export function openPopup(launchUrl: string): Window | null {
  // Two arguments, deliberately. The third is the features string, and it is
  // the one place `noopener` can get in. There is nothing else a features
  // string would buy: the flow lays itself out at whatever size it is given.
  //
  // `noopener` is not available to us, and the cost is worth stating because
  // it is not only the completion message. It makes `window.open` return
  // `null`, so there would also be no window to watch for a close, and no
  // `source` to check an inbound message against — three of the four things
  // this mode does, gone, rather than one hardening applied.
  //
  // What the opener costs is an invariant rather than nothing: a window
  // holding an opener hands that reference to every document it is
  // subsequently navigated to, so this window must only ever be navigated
  // within the connect origin. That is the app's to hold, and the reason a
  // provider step belongs in a window of its own rather than in this one.
  // Teardown closes the window, so the reference lives exactly as long as the
  // launch does.
  const popup = window.open(launchUrl, windowName()) ?? null;
  return popup !== null && isClosed(popup) ? null : popup;
}

/**
 * A name no other window has, so `window.open` always opens a new one rather
 * than finding a window left over from an earlier page. Not secret, only
 * distinct: the time and a random tail are enough to never meet a stale name.
 */
function windowName(): string {
  return `${WINDOW_NAME}-${Date.now().toString(36)}-${randomTail()}`;
}

/**
 * Whether a window is closed. A window that will not say is taken as open:
 * every caller is a click handler or a timer, and an exception there would
 * escape the user's click or fire on every tick.
 */
export function isClosed(popup: Window): boolean {
  try {
    return popup.closed === true;
  } catch {
    return false;
  }
}

/**
 * Notice the user closing the window.
 *
 * Closing a window posts nothing, so polling `closed` is the only signal a
 * cross-origin window gives us. Without it a launch would stay live forever,
 * holding the slot and listening for a window that is gone.
 *
 * Returns the function that stops the watch.
 */
export function watchClosed(popup: Window, onClosed: () => void): () => void {
  const timer = setInterval(() => {
    // Same guard as on open: a window that will not say is taken as open,
    // rather than throwing out of a timer every tick for the life of the launch.
    if (!isClosed(popup)) return;
    clearInterval(timer);
    onClosed();
  }, WATCHDOG_MS);

  return () => clearInterval(timer);
}

/**
 * How soon after opening a window may report itself closed before we stop
 * believing a person closed it. A window takes longer than this to draw, let
 * alone to be read and dismissed.
 */
export const SEVERED_MS = 1500;

/**
 * Tell the developer that the window they just watched close was not closed
 * by the user.
 *
 * A launching page served with `Cross-Origin-Opener-Policy: same-origin`
 * loses its handle on a window the moment the window navigates to another
 * site: the handle reports `closed`, the window's `opener` is gone, and the
 * flow runs on in it with nothing to post to. From here that is
 * indistinguishable from the user closing the window, except for how soon it
 * happens, and the header is invisible to script, so the console is the only
 * place left to say so. The launch still ends the way a close ends it, because
 * this page will hear nothing more from that window either way.
 */
export function warnSevered(elapsedMs: number): void {
  console.warn(
    `@catenaclearing/connect-sdk: the Catena Connect window reported itself closed ${Math.round(elapsedMs)}ms after it opened, before the flow posted an outcome, so onClose was delivered with no outcome. ` +
      "The usual cause is a Cross-Origin-Opener-Policy of same-origin on this page, which cuts it off from any window it opens to another site. The flow keeps running in that window, but this page cannot hear it. " +
      "Serve the launching page with Cross-Origin-Opener-Policy: same-origin-allow-popups, or without the header."
  );
}

/**
 * Run the flow in this tab, because the browser refused the window too.
 *
 * The record goes down before the assignment: once the tab is assigned this
 * page gets no more turns, and that record is the only thing making the
 * callback on the far side possible.
 *
 * Nothing is emitted on the way out. A dismissal here would land on a page
 * about to be destroyed, then land again on resume.
 *
 * Returns the record's identifier so the launch can clear it if it is torn
 * down before the navigation takes, or `null` if storage refused. Either way
 * the tab is assigned.
 */
export function redirect(launchUrl: string): string | null {
  const pending = writePending();
  window.location.assign(launchUrl);
  return pending;
}
