/**
 * Catena Connect embed SDK.
 *
 * `open()` launches the flow, `resume()` delivers the outcome on the page a
 * redirected flow returns to, and `preload()` resolves the mode decision ahead
 * of a launch. Nothing else is exported.
 */

import { type Listener, listen } from "./messages";
import {
  isClosed,
  mountFrame,
  openPopup,
  REVEAL_GRACE_MS,
  redirect,
  watchClosed,
} from "./modes";
import { clearPending, takePending } from "./pending";
import {
  detectPartitionedCookies,
  type ProbeVerdict,
  resolvedVerdict,
} from "./probe";
import { createSurface, type Surface } from "./surface";
import type {
  CatenaConnectHandle,
  CatenaConnectOptions,
  PreloadOptions,
  ResumeOptions,
} from "./types";
import { buildLaunchUrl, connectOrigin, withEmbedMode } from "./url";
import { EMBED_FRAME, EMBED_POPUP, EMBED_REDIRECT } from "./wire";

export type {
  CatenaConnectHandle,
  CatenaConnectOptions,
  ConnectCallbacks,
  ConnectCloseEvent,
  ConnectConnectionDeletedEvent,
  ConnectConnectionEvent,
  ConnectExitEvent,
  ConnectOpenEvent,
  ConnectSuccessEvent,
  ConnectTheme,
  ConnectVariant,
  PreloadOptions,
  ResumeOptions,
  ResumeOutcome,
} from "./types";

interface Launch {
  handle: CatenaConnectHandle;
  surface: Surface;
  /**
   * The message listener. Held rather than just stopped, because it also owns
   * the dismissal the popup watchdog synthesizes when the user closes the
   * window and the flow never gets to send one.
   */
  listener: Listener;
  /**
   * The window or frame the live mode created, once it has one. Read through a
   * thunk by the message guard, so the listener can be attached before the mode
   * has anything to trust.
   */
  source: Window | null;
  /** Everything to undo, newest first. */
  cleanups: Array<() => void>;
  /**
   * The flow reached a terminal event. The launch is no longer live, but its
   * surface stays until the caller tears it down.
   */
  finished: boolean;
  destroyed: boolean;
}

/**
 * One launch at a time. Two would put two flows in front of the user, each
 * with its own surface or window and its own callbacks, and nothing to tell
 * them which one they were finishing.
 */
let live: Launch | null = null;

export function open(options: CatenaConnectOptions): CatenaConnectHandle {
  if (live !== null && !live.destroyed) {
    // A second launch while one is live is a double click. They want the
    // surface they already have, not a second flow behind it.
    if (!live.finished) {
      live.surface.focus();
      return live.handle;
    }
    // A launch that ran to its end and was never torn down still owns a
    // surface. Relaunching replaces it rather than stacking on top.
    //
    // The dismissal goes first, through the path popup mode already uses when
    // a user closes the window and nothing is posted. The app sends its
    // `close` immediately behind the outcome, so a caller relaunching from
    // `onSuccess` is standing in a handler with that message already queued
    // behind them: tearing the listener down here would drop one sent before
    // they acted, not a late one. `dismiss()` settles the same state either
    // way, so a flow that did send its own never gets a second.
    const finished = live;
    finished.listener.dismiss();

    // `dismiss()` delivers `onClose` synchronously, and starting the next
    // flow from that callback is as ordinary as starting it from `onSuccess`.
    // If the caller did, the nested call has already replaced this launch and
    // handed them a handle, and it is this call that is late. The slot is
    // re-read rather than trusted from before the dismissal: tearing down
    // whatever it holds now would destroy the handle they were just given and
    // start a third flow behind it.
    const current: Launch | null = live;
    if (current !== null && current !== finished && !current.destroyed) {
      return current.handle;
    }

    // Anything else the old launch might still have heard is given up, which
    // is stricter than the message router (it tolerates an outcome arriving
    // after a dismissal). The app's contract orders them the other way and
    // never sends a dismissal alone, so an outcome after this point exists
    // only when the popup watchdog beats a message already queued by less
    // than its poll interval — and the caller relaunches inside `onClose`.
    // Carrying the listener until that outcome arrives means carrying it
    // forever when none does, which is every launch the user closed. Once a
    // second launch has started the caller has moved on, and the alternative
    // is a listener outliving its launch with nothing bounding its life.
    destroy(finished);
  }

  const origin = connectOrigin(options.inviteUrl);
  // The probe asks with the same key the launch will carry, because whether
  // the app lets this page frame the flow depends on it.
  const { embedKey } = options;
  // Built now rather than when the verdict lands, so the launch is decided by
  // the options as they were at the call. The probe can put seconds between
  // the two, and a caller re-rendering in that window should not be able to
  // move the frame somewhere else.
  const launchUrl = buildLaunchUrl(options);
  const surface = createSurface(options.container);

  // Frame mode needs no user gesture, which is what lets the surface go up
  // first and the mode be decided behind it.
  //
  // Only a held "unsupported" skips the loading state: the affordance goes up
  // in its place on the next microtask, and a loading state would just be a
  // visible flicker. A held "supported" still shows it, because the frame it
  // mounts is blank until the flow has drawn.
  if (resolvedVerdict(origin, embedKey) !== "unsupported") {
    surface.showLoading();
  }

  const listener = listen(
    {
      origin,
      // Read at delivery rather than captured here: popup mode has no window
      // at all until the user activates the affordance.
      source: () => launch.source,
      // The flow is over. The listener stays attached, because the dismissal
      // may still follow and must still be delivered.
      onTerminal: () => {
        launch.finished = true;
        // A flow that ends before it said it was ready still has something
        // on screen worth showing, and nothing left to wait for.
        launch.surface.reveal();
      },
      onOpen: () => {
        launch.surface.reveal();
      },
      targets: messageTargets(options.container),
    },
    options
  );

  const launch: Launch = {
    handle: { destroy: () => destroy(launch) },
    surface,
    listener,
    source: null,
    cleanups: [listener.stop],
    finished: false,
    destroyed: false,
  };

  live = launch;

  void detectPartitionedCookies(origin, embedKey).then((verdict) => {
    // The caller may have torn the launch down while the probe ran — a
    // component unmounting behind a modal is the ordinary way that happens.
    if (launch.destroyed) return;
    enter(launch, verdict, launchUrl);
  });

  return launch.handle;
}

/** Put the resolved verdict into effect. */
function enter(launch: Launch, verdict: ProbeVerdict, launchUrl: string): void {
  if (verdict === "supported") {
    const frame = mountFrame(
      launch.surface,
      withEmbedMode(launchUrl, EMBED_FRAME)
    );
    launch.source = frame.contentWindow;

    // The frame stays behind the loading state until the flow posts `open`.
    // If that never comes — an error page in the frame, or an app that
    // cannot reach this page to say so — the frame is shown anyway, a little
    // after its document loaded, so a missing message can never leave the
    // user on a spinner with nothing behind it.
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const onLoad = (): void => {
      clearTimeout(fallback);
      fallback = setTimeout(() => launch.surface.reveal(), REVEAL_GRACE_MS);
    };
    frame.addEventListener("load", onLoad);

    launch.cleanups.push(() => {
      clearTimeout(fallback);
      frame.removeEventListener("load", onLoad);
      frame.remove();
    });
    return;
  }

  offer(launch, launchUrl);
}

/**
 * The frame cannot be carried here, so offer the user a window.
 *
 * The whole of popup mode lives inside the activation handler, and that is the
 * point of the shape: by the time the probe answered, the gesture that called
 * `open()` was spent, and the only fresh one available is the user activating
 * this affordance. Nothing is awaited between the two.
 */
function offer(launch: Launch, launchUrl: string): void {
  // The window this launch opened, and the watch on it. Held here rather than
  // pushed onto the cleanups per activation, because an activation can replace
  // the window and we must never end up with two watchdogs, or with one
  // watching a window we have moved off.
  let opened: Window | null = null;
  let stopWatch: (() => void) | null = null;
  // The identifier of the record redirect mode wrote, if it got that far. Held
  // so the teardown can clear that record and no other.
  let pending: string | null = null;

  launch.surface.showContinue(() => {
    // A launch that already ended, or was torn down with the affordance still
    // on screen, has nothing left to open a window for.
    if (launch.finished || launch.destroyed) return;

    // The window is already open, so they are asking to be taken back to it —
    // it has slipped behind the page. Calling `window.open` again would not do
    // that: it opens a second window beside this one, restarting a flow they
    // are part-way through.
    if (opened !== null && !isClosed(opened)) {
      opened.focus();
      return;
    }

    // Anything still held here has been closed, inside the half second before
    // the watchdog noticed. Retire it before trying to open its replacement,
    // not after: if the browser refuses that one, a watch left running on the
    // closed window would dismiss a launch the user is in the middle of
    // retrying.
    stopWatch?.();
    stopWatch = null;
    opened = null;
    launch.source = null;

    const popup = openPopup(withEmbedMode(launchUrl, EMBED_POPUP));

    // The browser refused even this, outright or by handing back a window
    // that was already closed, so the flow runs in this tab. Nothing is torn
    // down and nothing is emitted: the page is about to be destroyed by the
    // navigation, and a dismissal here would reach the caller once now and
    // again on resume.
    if (popup === null) {
      pending = redirect(withEmbedMode(launchUrl, EMBED_REDIRECT));
      return;
    }

    opened = popup;
    launch.source = popup;
    stopWatch = watchClosed(popup, launch.listener.dismiss);
  });

  launch.cleanups.push(() => {
    stopWatch?.();
    stopWatch = null;

    // A launch torn down before its navigation took leaves a record nothing
    // will ever resume. Clearing it keeps the next `resume()` from finding it
    // and announcing an outcome for a flow that never went out.
    if (pending !== null) {
      clearPending(pending);
      pending = null;
    }

    // The window goes with the launch that opened it, the same way frame mode's
    // frame does. A window left standing puts the user in a flow nobody is
    // listening for any more, beside whatever window the next launch opens.
    close(opened);
    opened = null;
  });
}

/**
 * Close a window this package opened, if it is still standing.
 *
 * Everything is inside the guard, the `closed` read included. This runs from a
 * cleanup, and a cleanup that throws takes the rest of the teardown with it:
 * the surface would stay on the page and the launch slot would stay pinned, so
 * the caller could never launch again. A window that will not close is not
 * worth that.
 */
function close(popup: Window | null): void {
  if (popup === null) return;
  try {
    if (popup.closed) return;
    popup.close();
  } catch {
    // Nothing downstream depends on this having worked: every listener and
    // timer the launch owned is already gone by the time it runs.
  }
}

/**
 * Where the flow's messages arrive: this window, which a popup posts to as its
 * opener, and the container's window, which a frame posts to as its parent.
 * The same window for nearly every caller. A different one when the caller
 * runs us from their top window and hands over a container inside a frame of
 * theirs, and listening only here would then drop every callback the framed
 * flow sends.
 */
function messageTargets(container: HTMLElement | undefined): Window[] {
  const theirs = container?.ownerDocument.defaultView;
  return theirs && theirs !== window ? [window, theirs] : [window];
}

/**
 * Remove every listener, timer, frame and node this launch created.
 * Idempotent and safe after the flow has ended.
 */
function destroy(launch: Launch): void {
  if (launch.destroyed) return;
  launch.destroyed = true;

  // Newest first, so a cleanup never runs against something a later one still
  // depends on.
  for (const cleanup of launch.cleanups.reverse()) {
    cleanup();
  }
  launch.cleanups.length = 0;
  launch.source = null;
  launch.surface.destroy();

  // Only if this launch still holds the slot, so an older handle's teardown
  // cannot clear a launch that replaced it.
  if (live === launch) {
    live = null;
  }
}

/**
 * Deliver the terminal callback on the page a redirected flow returned to.
 *
 * You state which of your two destination pages this is, because we cannot
 * work it out: the app signals the outcome by choosing between two URLs that
 * live on the invitation, and we are given the invitation, not what is behind
 * it.
 *
 * **What this keys off.** Not "did this page come back from the flow" — we
 * have no way to know that. It keys off "did a redirected launch go out from
 * this tab recently, and has nothing reported it yet". Two consequences to
 * design around:
 *
 * - Calling this on a page reached by an ordinary route is silent *only while
 *   no launch is in flight*. A redirected launch the user abandoned stays
 *   recorded until it expires, so a call inside that window consumes it and
 *   emits the outcome you declared. Put the call on your two destination pages
 *   and treat a callback as evidence that a launch went out from this tab, not
 *   as proof this page was reached from it.
 * - Both destination pages must be on the same origin as the page that
 *   launched, because the `sessionStorage` record is partitioned by origin as
 *   well as by tab.
 * - Delivery is at-most-once per tab rather than outright. A tab opened by the
 *   launching tab while the launch was in flight inherits a copy of its session
 *   storage, so it can report the same outcome again.
 *
 * Closing both gaps is the same change, and it is the app's to make: appending
 * the outcome to the destination URL it navigates to.
 */
export function resume(options: ResumeOptions): void {
  // Neither declared outcome, which in untyped JavaScript means a typo.
  // Guessing between them would tell a caller a flow failed that succeeded.
  //
  // Checked before the record is touched, so a call that cannot report anything
  // does not consume the launch a later, correct call would have reported.
  if (options.outcome !== "success" && options.outcome !== "exit") return;

  // Read and clear in one step. Live or long dead, the record has been spent by
  // this call, and a dead one left behind is one a later resume trips over.
  if (!takePending()) return;

  try {
    if (options.outcome === "success") {
      // Empty, and the documentation says so: nothing survives a full-page
      // navigation to carry the identifiers across.
      options.onSuccess?.({ connectionIds: [] });
    } else {
      // No reason to forward. The app reports one over the message channel that
      // redirect mode does not have, and inventing a string here would put
      // words the app never said into the caller's logs.
      options.onExit?.({ reason: "" });
    }
  } finally {
    // The dismissal is not the outcome callback's to suppress. On the other two
    // modes these arrive as separate messages, so a handler that throws takes
    // only itself down — and a caller writes one set of handlers for all
    // three. The caller's exception still propagates; this only orders the
    // two.
    options.onClose?.({});
  }
}

/**
 * Resolve the mode decision early so the next `open()` does not wait on it.
 * An optimization, never a requirement.
 *
 * Nothing is returned and nothing is awaited: the verdict lands in the probe's
 * cache, which is where `open()` reads it from. The cache is in memory and
 * never persisted, because a remembered "supported" would outlive the browser
 * or setting that earned it.
 *
 * The cache holds one verdict per origin and embed key, because the app
 * decides whether this page may frame the flow by the key. Pass the key the
 * launch will use and this warms the exact verdict `open()` reads. Without
 * one it still probes, keyless, and an `open()` with a key probes again.
 *
 * **Calling this can never break the page.** A URL with no origin to derive
 * throws from `open()`, where a launch is at stake. Here there is nothing to
 * get wrong, and callers run this on mount — often with an invitation their
 * data layer has not delivered yet.
 */
export function preload(options: PreloadOptions): void {
  let origin: string;
  try {
    origin = connectOrigin(options.inviteUrl);
  } catch {
    return;
  }

  // Read now, so a caller mutating the options before the document is ready
  // cannot change which verdict this warms.
  const { embedKey } = options;

  // Never rejects, so there is no unhandled rejection behind the `void`. A
  // probe already resolved or running for this origin and key is reused.
  const probe = (): void => {
    void detectPartitionedCookies(origin, embedKey);
  };

  // The probe mounts a frame on the document, and the caller most likely to
  // call this is calling it from a script in the head, where there is no body
  // to mount on yet. Wait for the document rather than spend the call on it.
  if (document.body === null) {
    // `once`, so nothing outlives the event. On the document rather than the
    // window because that is where this fires, and a null body means the parser
    // is still running, so it is guaranteed to.
    document.addEventListener("DOMContentLoaded", probe, { once: true });
    return;
  }

  probe();
}
