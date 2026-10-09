/**
 * The public type surface: the options you pass, the handle you get back, and
 * every event payload.
 */

/**
 * How the flow presents itself.
 *
 * The literal values are an editor aid, not a gate. They autocomplete, and the
 * `string` arm keeps a value the app has newly started accepting compiling
 * against an already-installed version of this package. Removing the widening
 * would make our release cadence a gate on the app's.
 *
 * Nothing here is validated at runtime either. The app ignores a value it does
 * not recognize and falls back, so a check here could only turn that fallback
 * into an error, using a list guaranteed to lag the app's.
 */
export type ConnectVariant = "full" | "card" | (string & {});

/**
 * The flow's color scheme. Widened for the reason `ConnectVariant` is.
 *
 * There is no `auto`. The app takes a forced theme or nothing, and omitting
 * this is what leaves its own resolution alone — so a value named `auto`
 * would only be a second spelling of leaving it out.
 */
export type ConnectTheme = "light" | "dark" | (string & {});

/** The flow reported it is ready. Carries nothing. */
export type ConnectOpenEvent = Record<string, never>;

/**
 * One provider was connected. Not an ending: the flow is still running, the
 * surface stays up, and `onSuccess` still follows when the user finishes.
 */
export interface ConnectConnectionEvent {
  /** The connection just established or restored. */
  connectionId: string;
}

/**
 * The fleet deleted one of its connections. Not an ending, as with
 * `onConnection`: the flow is still running.
 */
export interface ConnectConnectionDeletedEvent {
  /** The connection just deleted. */
  connectionId: string;
}

/** The flow completed. */
export interface ConnectSuccessEvent {
  /**
   * The connections this launch established or restored, less any the fleet
   * deleted before finishing. Empty on a resumed launch: nothing survives a
   * full-page navigation to carry them.
   */
  connectionIds: string[];
}

/** The flow ended without success. */
export interface ConnectExitEvent {
  /**
   * Why the flow ended, as reported by the app. Forwarded unchanged.
   *
   * Empty on a resumed launch. The app reports the reason over the message
   * channel, which a full-page redirect does not have, so we carry no reason
   * rather than an invented one.
   */
  reason: string;
}

/**
 * The surface should be dismissed. May follow either terminal event or arrive
 * alone. A surface this package did not create is never dismissed for you.
 */
export type ConnectCloseEvent = Record<string, never>;

/** The event callbacks. All optional. */
export interface ConnectCallbacks {
  onOpen?: (event: ConnectOpenEvent) => void;
  onConnection?: (event: ConnectConnectionEvent) => void;
  onConnectionDeleted?: (event: ConnectConnectionDeletedEvent) => void;
  onSuccess?: (event: ConnectSuccessEvent) => void;
  onExit?: (event: ConnectExitEvent) => void;
  onClose?: (event: ConnectCloseEvent) => void;
}

/** Options for `open()`. */
export interface CatenaConnectOptions extends ConnectCallbacks {
  /**
   * The invitation URL you were issued. The origin this package trusts — for
   * the frame, the window, and every inbound message check — is derived from
   * it, so the package holds no origin of its own.
   */
  inviteUrl: string;
  /**
   * Your embed key, forwarded as its own parameter. The app resolves it
   * server-side against registered origins; we neither parse nor validate it.
   */
  embedKey: string;
  /**
   * Mount the flow here instead of in our overlay. Behavior is otherwise
   * identical, including on the fallback modes.
   *
   * `HTMLElement` rather than `Element`: the surface is HTML, and an SVG or
   * MathML node would accept it into the tree without ever rendering it.
   */
  container?: HTMLElement;
  /**
   * Which layout the flow renders. `"full"` is the flow as it renders on its
   * own, header included. `"card"` is the connection card alone, filling its
   * mount, with no header. Defaults to `"full"`.
   */
  variant?: ConnectVariant;
  /**
   * Force a color scheme. Omit to follow the user's own preference. There is
   * no `"auto"`: the flow cannot see your page's theme.
   */
  theme?: ConnectTheme;
  /**
   * Logo for the flow, as an absolute https URL. Replaces your account's logo
   * in the navigation header under the `"full"` variant and on the invite
   * consent card under either, and only when the embed key resolves.
   */
  logoUrl?: string;
  /** The dark-theme logo. Falls back to `logoUrl` when omitted or invalid. */
  logoUrlDark?: string;
  /**
   * The flow's primary color as six hex digits, with or without a leading
   * `#`. Honored only when the embed key resolves.
   */
  brandColor?: string;
}

/** Which of your two destination pages `resume()` was called on. */
export type ResumeOutcome = "success" | "exit";

/** Options for `resume()`. */
export interface ResumeOptions extends ConnectCallbacks {
  /**
   * Whether this is your success destination or your failure one. We cannot
   * work it out: the app signals the outcome by which destination URL it
   * navigates to, and those URLs live on the invitation.
   */
  outcome: ResumeOutcome;
}

/** Options for `preload()`. */
export interface PreloadOptions {
  /** The invitation URL, because the origin to probe comes from it. */
  inviteUrl: string;
  /**
   * The embed key the launch will use. The verdict is held per origin and
   * key, because the app decides by the key whether this page may frame the
   * flow, so passing the launch's key warms the exact verdict `open()` reads.
   * Omit it and the probe runs without a key; an `open()` with a key then
   * probes again.
   */
  embedKey?: string;
}

/** What `open()` returns. */
export interface CatenaConnectHandle {
  /**
   * Remove everything this launch owns: its surface, the frame or window it
   * opened, its listener and its timers. Idempotent and safe after the flow
   * has ended, so it is correct to call from a component teardown that may
   * run at any point.
   *
   * A probe already in flight is not the launch's to stop. It belongs to the
   * page — `preload()` runs one with no launch at all — it removes its own
   * frame, listener and timer within its budget, and the verdict it reaches
   * is kept so the next launch with the same key skips the probe.
   */
  destroy(): void;
}
