/**
 * The public type surface: the options you pass, the handle you get back, and
 * every event payload.
 */

/**
 * How the flow presents itself.
 *
 * The literal values are there for autocomplete. The `string` arm lets a
 * value the app has newly started accepting compile against an
 * already-installed version of this package, so using it never has to wait
 * for a release of ours.
 *
 * Values are not validated at runtime either. The app ignores a value it does
 * not recognize and falls back, so a check here could only turn that fallback
 * into an error, and its list would always be behind the app's.
 */
export type ConnectVariant = "full" | "card" | (string & {});

/**
 * The flow's color scheme. Widened for the reason `ConnectVariant` is.
 *
 * There is no `auto`. The app takes either a forced theme or nothing, and
 * leaving this out is how you let it resolve the theme itself, so an `auto`
 * value would only be another way of leaving it out.
 */
export type ConnectTheme = "light" | "dark" | (string & {});

/** The flow reported it is ready. Carries nothing. */
export type ConnectOpenEvent = Record<string, never>;

/**
 * One provider was connected. This is not a terminal event: the flow keeps
 * running, the surface stays up, and `onSuccess` still follows when the user
 * finishes.
 */
export interface ConnectConnectionEvent {
  /** The connection just established or restored. */
  connectionId: string;
}

/**
 * The fleet deleted one of its connections. Like `onConnection`, this is not
 * a terminal event, and the flow keeps running.
 */
export interface ConnectConnectionDeletedEvent {
  /** The connection just deleted. */
  connectionId: string;
}

/** The flow completed. */
export interface ConnectSuccessEvent {
  /**
   * The connections this launch established or restored, less any the fleet
   * deleted before finishing. Empty on a resumed launch, because the IDs do
   * not survive the full-page navigation.
   */
  connectionIds: string[];
}

/** The flow ended without success. */
export interface ConnectExitEvent {
  /**
   * Why the flow ended, as reported by the app. Forwarded unchanged.
   *
   * On a resumed launch, read from the failure URL the flow returned to: its
   * `skip_reason` when there is one, otherwise its `status`. This matches what
   * the message channel reports for the same exit. Empty if the URL carries
   * neither.
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
   * server-side against registered origins. The only check here is that it is
   * a non-empty string: `open()` throws a `TypeError` otherwise.
   */
  embedKey: string;
  /**
   * Mount the flow here instead of in our overlay. Behavior is otherwise
   * identical, including on the fallback modes.
   *
   * Typed as `HTMLElement` because the surface is HTML. An SVG or MathML
   * element would accept it into the tree but never render it.
   */
  container?: HTMLElement;
  /**
   * Which layout the flow renders. `"full"` is the complete flow, including
   * its header. `"card"` is the connection card alone, filling its
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
  /**
   * The flow's success color as six hex digits, with or without a leading
   * `#`. Replaces the green that marks a connection: the progress indicator
   * once the user has one, connected providers and success messages. If it is
   * omitted, the green stays even when `brandColor` is set. Honored only when
   * the embed key resolves.
   */
  brandSecondary?: string;
}

/** Which of your two destination pages `resume()` was called on. */
export type ResumeOutcome = "success" | "exit";

/** Options for `resume()`. */
export interface ResumeOptions extends ConnectCallbacks {
  /**
   * Whether this is your success destination or your failure one. The package
   * cannot tell on its own, because the app signals the outcome by which
   * destination URL it navigates to, and those URLs are set on the invitation.
   */
  outcome: ResumeOutcome;
}

/** Options for `preload()`. */
export interface PreloadOptions {
  /** The invitation URL, because the origin to probe comes from it. */
  inviteUrl: string;
  /**
   * The embed key the launch will use. The verdict is cached per origin and
   * key, because the app uses the key to decide whether this page may frame
   * the flow. Pass the launch's key so `open()` can reuse the verdict. Omit it
   * and the probe runs without a key; an `open()` with a key then probes
   * again. If the key is empty, whitespace or not a string, `preload()` does
   * nothing.
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
   * It does not stop a probe already in flight, because a probe serves the
   * whole page rather than one launch (`preload()` runs one with no launch at
   * all). The probe removes its own frame, listener and timer within its
   * budget, and its verdict is kept so the next launch with the same key skips
   * the probe.
   */
  destroy(): void;
}
