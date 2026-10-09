/**
 * Inbound messages: what is allowed through, and what it becomes.
 *
 * Three guards, all required. Origin defeats an unrelated page posting a
 * lookalike payload. Source defeats a listener left over from an abandoned
 * launch matching a later one. The payload marker defeats unrelated traffic
 * from our own origin. Dropping any one leaves a real hole.
 */

import type { ConnectCallbacks } from "./types";
import {
  EVENT_CLOSE,
  EVENT_CONNECTION,
  EVENT_CONNECTION_DELETED,
  EVENT_EXIT,
  EVENT_OPEN,
  EVENT_SUCCESS,
  MESSAGE_SOURCE,
  type WireEnvelope,
} from "./wire";

export interface MessageRouting {
  /** The origin every inbound message must have come from. */
  origin: string;
  /**
   * The window or frame this launch created.
   *
   * A thunk rather than a value: a frame has no `contentWindow` until it is in
   * the document, and popup mode has no window until the user activates the
   * affordance. Reading it at delivery time lets the listener attach before
   * either exists; a message arriving in between has no source to match and is
   * correctly rejected.
   */
  source: () => Window | null;
  /**
   * Called once when the flow is over: the first of a terminal event or a
   * dismissal. This is how the launch learns it is no longer live.
   */
  onTerminal?: () => void;
  /**
   * Called on every `open`, before the caller's `onOpen`. This is how the
   * launch learns the flow has drawn and its frame can be shown.
   */
  onOpen?: () => void;
  /**
   * Every window the flow's messages can land on. A window posts to its
   * opener, which is always this one; a frame posts to its parent, which is
   * the window of whatever document the caller's container lives in. Defaults
   * to this window alone. Listening on more than one opens nothing up: each
   * message is dispatched on exactly one window, and the three guards still
   * apply to it there.
   */
  targets?: readonly Window[];
}

/** What a caller holds onto for the life of a launch. */
export interface Listener {
  /** Remove the listener. */
  stop(): void;
  /**
   * Deliver the dismissal for a flow that ended without sending one, which
   * happens exactly one way: the user closes the popup, and that posts
   * nothing. Routed through here rather than called directly so both
   * dismissals settle the same state and a flow that sent its own never gets
   * a second one on top.
   */
  dismiss(): void;
}

/**
 * Listen for the app's events and map them onto the caller's callbacks.
 */
export function listen(
  routing: MessageRouting,
  callbacks: ConnectCallbacks
): Listener {
  // Success and exit are terminal and mutually exclusive: whichever arrives
  // first is the outcome, and a second one is not a correction.
  let settled = false;
  // Whether the launch is still live. Separate from `settled`, which is about
  // which outcome the caller was told.
  let over = false;
  // Whether the caller has been told to take the surface down. `over` is set
  // by whichever terminal event came first and says nothing about that.
  let dismissed = false;

  const finish = (): void => {
    if (over) return;
    over = true;
    routing.onTerminal?.();
  };

  const dismiss = (): void => {
    // A dismissal arriving alone still ends the launch, so mark it over before
    // entering caller code. It does not settle the outcome: only success and
    // exit say what happened, and gating them behind a dismissal would let one
    // that raced ahead swallow the outcome.
    finish();
    if (dismissed) return;
    dismissed = true;
    callbacks.onClose?.({});
  };

  const handler = (event: MessageEvent): void => {
    if (!isTrusted(event, routing)) return;

    const envelope = event.data as WireEnvelope;

    // An unrecognized version still delivers the events we recognize.
    // Additions are compatible, so refusing a message for carrying a version
    // we have not heard of would let an app-side addition break every
    // installed package.
    switch (envelope.event) {
      case EVENT_OPEN:
        routing.onOpen?.();
        callbacks.onOpen?.({});
        return;

      // Not terminal, and not gated on anything: it reports a connection the
      // app has already made, and the flow is still live when it arrives. A
      // non-string identifier delivers an empty one, as an exit's reason does.
      case EVENT_CONNECTION:
        callbacks.onConnection?.({
          connectionId: asString(envelope.connectionId),
        });
        return;

      // The same as a connection, in the other direction.
      case EVENT_CONNECTION_DELETED:
        callbacks.onConnectionDeleted?.({
          connectionId: asString(envelope.connectionId),
        });
        return;

      // Both terminal cases settle the launch completely before handing
      // control to the caller. Their callback may re-enter the package, and
      // it may throw; neither should leave a finished launch looking live.
      case EVENT_SUCCESS: {
        if (settled) return;
        settled = true;
        finish();
        // Read beside `event`, not from a `payload` key: that is where the
        // app puts them, and where its integration document tells a raw
        // consumer to look. The probe is the message that nests, and it is
        // not handled here.
        callbacks.onSuccess?.({
          connectionIds: asStrings(envelope.connectionIds),
        });
        return;
      }

      case EVENT_EXIT: {
        if (settled) return;
        settled = true;
        finish();
        callbacks.onExit?.({ reason: asString(envelope.reason) });
        return;
      }

      case EVENT_CLOSE: {
        // Close may follow a terminal event or arrive alone. `dismiss` handles
        // both, and is also what the popup watchdog calls when the user closes
        // the window and the app never gets to send this.
        dismiss();
        return;
      }

      default:
        // An event name this version does not know is ignored, never an error.
        return;
    }
  };

  const targets = routing.targets ?? [window];
  for (const target of targets) {
    target.addEventListener("message", handler);
  }
  return {
    stop: () => {
      for (const target of targets) {
        target.removeEventListener("message", handler);
      }
    },
    dismiss,
  };
}

/** All three guards. Any one alone is insufficient. */
function isTrusted(event: MessageEvent, routing: MessageRouting): boolean {
  if (event.origin !== routing.origin) return false;

  const source = routing.source();
  if (source === null || event.source !== source) return false;

  const envelope = event.data as WireEnvelope | null | undefined;
  return asRecord(envelope).source === MESSAGE_SOURCE;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * All or nothing: a list of strings is forwarded as it arrived, anything else
 * becomes the empty list.
 *
 * Deliberately not a filter. Dropping the elements that look wrong would hand
 * the caller a shorter list than the flow established, with no way to know
 * it. The empty list is a case the contract already defines.
 */
function asStrings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : [];
}

/** The reason is the app's to word; we forward it and invent nothing. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
