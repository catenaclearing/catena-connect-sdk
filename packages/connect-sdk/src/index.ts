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
  OPEN_GRACE_MS,
  openPopup,
  redirect,
  SEVERED_MS,
  warnSevered,
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
   * Reads the window the live mode created, once it has one. Called by the
   * message guard on every message, so the listener can be attached before the
   * mode has anything to trust.
   *
   * A reader rather than the window, because a frame's window is not fixed: it
   * has none until it is in the document, and moving it to another parent (a
   * portal re-parenting the caller's container) gives it a new one. When the
   * window was read once at mount, either case left every callback failing
   * the source check while the flow itself kept running, shown only by the
   * fallback, and nothing reported the problem.
   */
  source: () => Window | null;
  /**
   * Bring the launch back to the user when they ask for it again. The
   * surface, until popup mode opens a window: from then on the flow is in that
   * window, and the surface is only the affordance that opened it.
   */
  refocus: () => void;
  /** Everything to undo, newest first. */
  cleanups: Array<() => void>;
  /**
   * The flow has said it is on screen, so the frame it runs in is never
   * given up on.
   */
  opened: boolean;
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

/**
 * Launch the flow and return its handle.
 *
 * The flow renders in the package's own overlay, or inside `container` when
 * you pass one. The returned handle has one method, `destroy()`, which removes
 * everything the launch created.
 *
 * Throws a `TypeError` if the invite URL does not parse, is not http or https,
 * or is http on any host other than `localhost`, `127.0.0.1` or `[::1]`. It
 * also throws when called outside a browser, or before `<body>` exists with no
 * `container`.
 *
 * One flow runs at a time. Calling this while a launch is live brings that
 * launch back to the user and returns its handle instead of starting a second
 * flow. Once a launch has ended and has not been destroyed, calling this
 * replaces it: the old launch gets `onClose` if it has not had one, its
 * surface is removed, and a new flow starts with a new handle.
 */
export function open(options: CatenaConnectOptions): CatenaConnectHandle {
  if (live !== null && !live.destroyed) {
    // A second launch while one is live is a double click. Bring back the
    // surface the user already has instead of starting a second flow behind
    // it.
    if (!live.finished) {
      live.refocus();
      return live.handle;
    }
    // A launch that ran to its end and was never torn down still owns a
    // surface. Relaunching replaces it rather than stacking on top.
    //
    // The dismissal goes first, through the path popup mode already uses when
    // a user closes the window and nothing is posted. The app sends its
    // `close` immediately behind the outcome, so when a caller relaunches from
    // `onSuccess`, that message is already queued behind their handler.
    // Tearing the listener down here would drop a message sent before they
    // acted, not a late one. `dismiss()` settles the same state either
    // way, so a flow that did send its own never gets a second.
    const finished = live;
    try {
      finished.listener.dismiss();
    } catch (error) {
      // Their `onClose` threw. Letting it out of here would stop this launch
      // with the old surface still standing, and the user would have to ask
      // twice. It is reported the way an exception from any other callback
      // is, out of its own task, and the relaunch goes ahead.
      rethrowLater(error);
    }

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
    // than its poll interval, and the caller relaunches inside `onClose`.
    // Keeping the listener until that outcome arrives means keeping it forever
    // when none does, which is every launch the user closed. Once a second
    // launch has started, the caller no longer cares about the old outcome,
    // and keeping the listener would leave it outliving its launch with
    // nothing to end it.
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
  // The overlay's close button and Escape key end the launch through the same
  // dismissal the popup watchdog uses, so the caller hears an ordinary
  // `onClose` and stays the one who takes the surface down.
  //
  // The flow comes off the surface first. The dismissal reveals a frame still
  // held behind the loading state, which would put the flow back in front of
  // someone who just closed it. Messages the flow sends after that are also
  // ignored, because a frame or window left running until the caller's
  // teardown could still finish and deliver an outcome after the close.
  const surface = createSurface(options.container, {
    onDismiss: () => {
      launch.surface.clear();
      launch.source = none;
      launch.listener.dismiss();
    },
    theme: options.theme,
  });

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
      source: () => launch.source(),
      // The flow is over. The listener stays attached, because the dismissal
      // may still follow and must still be delivered.
      onTerminal: () => {
        launch.finished = true;
        // A flow that ends before it said it was ready still has something
        // on screen worth showing, and nothing left to wait for.
        launch.surface.reveal();
      },
      onOpen: () => {
        launch.opened = true;
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
    source: none,
    refocus: () => surface.focus(),
    cleanups: [listener.stop],
    opened: false,
    finished: false,
    destroyed: false,
  };

  live = launch;

  void detectPartitionedCookies(origin, embedKey).then((verdict) => {
    // The caller may have torn the launch down while the probe ran. A
    // component unmounting behind a modal is the usual way that happens.
    if (launch.destroyed) return;
    // Or the user dismissed it from the overlay, and the caller has not torn
    // it down yet: their `onClose` may leave that for later. Mounting the
    // flow now would put it back in front of someone who just closed it, so
    // the surface is emptied of its loading state instead, since nothing is
    // coming to replace it.
    if (launch.finished) {
      launch.surface.clear();
      return;
    }
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
    launch.source = () => frame.contentWindow;

    // The frame stays behind the loading state until the flow posts `open`.
    // If that never comes after the frame loads, the most likely page in it
    // is the browser's refusal, so the launch drops the frame and offers the
    // window, which the same refusal does not apply to. A flow that ended
    // without `open` is revealed by `onTerminal` instead, and one that said
    // `open` keeps its frame whatever loads in it afterwards.
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const drop = (): void => {
      clearTimeout(fallback);
      frame.removeEventListener("load", onLoad);
      frame.remove();
    };
    const onLoad = (): void => {
      if (launch.opened || launch.finished) return;
      clearTimeout(fallback);
      fallback = setTimeout(() => {
        if (launch.opened || launch.finished || launch.destroyed) return;
        drop();
        // Before the window exists, so the guard stops trusting the frame
        // now rather than when the user activates the affordance.
        launch.source = none;
        offer(launch, launchUrl);
      }, OPEN_GRACE_MS);
    };
    frame.addEventListener("load", onLoad);

    launch.cleanups.push(drop);
    return;
  }

  offer(launch, launchUrl);
}

/**
 * The frame cannot be carried here, so offer the user a window.
 *
 * All of popup mode runs inside the activation handler. By the time the probe
 * answered, the gesture that called `open()` was spent, and the only fresh one
 * available is the user activating this affordance. Nothing is awaited
 * between the two.
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
  // Whether the live region is saying the window was blocked, so a retry that
  // opens one can take that back.
  let refused = false;

  launch.surface.showContinue(() => {
    // A launch that already ended, or was torn down with the affordance still
    // on screen, has nothing left to open a window for.
    if (launch.finished || launch.destroyed) return;

    // The window is already open, so they are asking to be taken back to it
    // because it has slipped behind the page. Calling `window.open` again would
    // not do that: it opens a second window beside this one, restarting a flow
    // they are part-way through.
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
    launch.source = none;

    const popup = openPopup(withEmbedMode(launchUrl, EMBED_POPUP));

    // Refused while this page is in a frame, so redirecting is not an option. A
    // redirect from here navigates only the frame, which loads the flow framed,
    // in the third-party context the probe has already found it cannot run in.
    // The affordance stays, and says what would let the next press work.
    if (popup === null && isFramed()) {
      launch.surface.announce(BLOCKED_MESSAGE);
      refused = true;
      return;
    }

    // The browser refused even this, outright or by handing back a window
    // that was already closed, so the flow runs in this tab. Do not tear
    // anything down or emit anything. The navigation is about to destroy the
    // page, and a dismissal here would reach the caller once now and again on
    // resume.
    if (popup === null) {
      pending = redirect(withEmbedMode(launchUrl, EMBED_REDIRECT));
      return;
    }

    opened = popup;
    launch.source = () => popup;

    // The window this press asked for is open now. Left alone, the region
    // would go on telling the user to allow pop-ups and press again, and a
    // press from here only brings that window back.
    if (refused) {
      launch.surface.announce();
      refused = false;
    }

    // A window that closes almost as soon as it opened, with the flow still
    // live, was most likely cut off rather than closed by the user (see
    // `warnSevered`). A window whose flow already reached its end reported
    // that before it went, which a severed window cannot do. In both cases
    // the launch ends, because nothing more will arrive from that window.
    const openedAt = Date.now();
    stopWatch = watchClosed(popup, () => {
      const elapsed = Date.now() - openedAt;
      if (elapsed < SEVERED_MS && !launch.finished) warnSevered(elapsed);
      launch.listener.dismiss();
    });
  });

  // A second `open()` while the window is up is the user looking for the
  // flow, and the flow is in the window. Focusing the surface would bring
  // back only the button that opened it.
  launch.refocus = () => {
    if (opened !== null && !isClosed(opened)) {
      opened.focus();
      return;
    }
    launch.surface.focus();
  };

  launch.cleanups.push(() => {
    stopWatch?.();
    stopWatch = null;

    // A launch torn down before its navigation took effect leaves a pending
    // record that will never be resumed. Clearing it keeps the next
    // `resume()` from finding it and announcing an outcome for a flow that
    // never went out.
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

/** The source of a launch with no window to trust yet, or any more. */
function none(): null {
  return null;
}

/**
 * What the affordance says when the browser refused the window and the page
 * is in a frame, so the flow cannot run in this tab instead.
 */
const BLOCKED_MESSAGE =
  "Your browser blocked the new window. Allow pop-ups for this site, then press Continue again.";

/**
 * Whether this page is inside a frame. Reading `top` is allowed across
 * origins; the guard is for a browser that throws anyway, where treating the
 * page as unframed keeps the redirect fallback working as before.
 */
function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return false;
  }
}

/**
 * Report a caller's exception without letting it unwind through us. Thrown
 * from a task of its own, it reaches the page's error handling the way one
 * thrown from a message-event callback does.
 */
function rethrowLater(error: unknown): void {
  setTimeout(() => {
    throw error;
  }, 0);
}

/**
 * Close a window this package opened, if it is still standing.
 *
 * Everything is inside the guard, the `closed` read included. This runs from a
 * cleanup, and a cleanup that throws takes the rest of the teardown with it:
 * the surface would stay on the page and the launch slot would stay pinned, so
 * the caller could never launch again. Failing to close a window is the
 * smaller problem.
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
  launch.source = none;
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
 * You state which of your two destination pages this is, because the package
 * cannot tell. The app signals the outcome by choosing between two URLs that
 * are set on the invitation, and the package sees only the invitation URL,
 * not those settings.
 *
 * **How it decides.** The package has no way to know whether this page came
 * back from the flow. It checks whether a redirected launch went out from
 * this tab recently and has not been reported yet. Three consequences to
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
 * - Delivery is at most once per tab, not once overall. A tab opened by the
 *   launching tab while the launch was in flight inherits a copy of its session
 *   storage, so it can report the same outcome again.
 *
 * The query string the app appends does not fix the first or the third. It
 * says how the flow ended, not which tab launched it, so a stale record would
 * still be consumed by the first page that calls this. Fixing them needs a
 * marker on the destination URL tying it to this launch, which the app would
 * have to add.
 */
export function resume(options: ResumeOptions): void {
  // Neither declared outcome, which in untyped JavaScript means a typo.
  // Guessing between them would tell a caller a flow failed that succeeded.
  //
  // Checked before the record is touched, so a call that cannot report anything
  // does not consume the launch a later, correct call would have reported.
  if (options.outcome !== "success" && options.outcome !== "exit") return;

  // Read and clear in one step. Whether it was still valid or long expired,
  // this call has used the record up, and an expired one left behind would
  // trip a later resume.
  if (!takePending()) return;

  try {
    if (options.outcome === "success") {
      // Empty, and the documentation says so: nothing survives a full-page
      // navigation to carry the identifiers across.
      options.onSuccess?.({ connectionIds: [] });
    } else {
      options.onExit?.({ reason: exitReason() });
    }
  } finally {
    // Deliver the dismissal even if the outcome callback throws. On the other
    // two modes these arrive as separate messages, so a handler that throws
    // does not stop the other one, and a caller writes one set of handlers
    // for all three. The caller's exception still propagates; this only
    // orders the two.
    options.onClose?.({});
  }
}

/**
 * The reason the app put on the failure URL, read the way the message channel
 * words it: the decline reason when the user gave one, otherwise the status.
 * So the same exit reports the same reason whichever mode carried it.
 *
 * Empty when the URL carries neither, so we never report a reason the app did
 * not send.
 */
function exitReason(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("skip_reason") || params.get("status") || "";
  } catch {
    return "";
  }
}

/**
 * Resolve the mode decision early so the next `open()` does not wait on it.
 * Optional: `open()` works the same without it.
 *
 * Nothing is returned and nothing is awaited: the verdict lands in the probe's
 * cache, which is where `open()` reads it from. The cache is in memory and
 * never persisted, because a remembered "supported" would outlive the browser
 * or setting that earned it.
 *
 * The cache holds one verdict per origin and embed key, because the app
 * uses the key to decide whether this page may frame the flow. Pass the key
 * the launch will use so `open()` can reuse the verdict. Without one it still
 * probes, keyless, and an `open()` with a key probes again.
 *
 * **This never throws.** A URL with no origin to derive throws from `open()`,
 * where a launch depends on it. Here it is ignored, because callers run this on
 * mount, often with an invitation their data layer has not delivered yet.
 * Outside a browser, during a server render, it does nothing: there is no
 * document to probe from.
 */
export function preload(options: PreloadOptions): void {
  // A server render reaches this from module scope or a component body. The
  // probe needs a document, and the verdict is per browser anyway.
  if (typeof document === "undefined") {
    return;
  }

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
