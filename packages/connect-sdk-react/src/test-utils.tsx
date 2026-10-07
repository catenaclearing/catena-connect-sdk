/**
 * The test harness every wrapper test shares. Test-only: nothing under
 * `src/index.ts` imports it, so it never reaches the build.
 *
 * No testing library. Mounting is `createRoot` under `act`, and every
 * assertion is about elements the core appended or about which handler ran,
 * none of which needs role or text queries.
 */

import {
  CONTRACT_VERSION,
  type CompletionMessage,
  EVENT_CLOSE,
  EVENT_PROBE,
  EVENT_SUCCESS,
  MESSAGE_SOURCE,
  PROBE_PATH,
  type ProbeMessage,
} from "@catenaclearing/connect-sdk/contract";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tells React that `act` is in charge of flushing, so it stops warning that
// updates happened outside of it.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export const ORIGIN = "https://connect.example.com";
export const inviteUrl = `${ORIGIN}/invite/abc123`;
export const embedKey = "pk_test_key";

export interface Mounted {
  root: Root;
  /** The element the tree is rendered into, appended to `document.body`. */
  container: HTMLDivElement;
  rerender(element: ReactNode): void;
  unmount(): void;
}

/** Render `element` into a fresh container on the document, under `act`. */
export function mount(element: ReactNode): Mounted {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    root,
    container,
    rerender(next) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** The elements the core appended, identified by their shadow root. */
export function surfacesIn(parent: ParentNode): Element[] {
  return [...parent.children].filter((child) => child.shadowRoot !== null);
}

/**
 * The hidden frames the core's probe mounted, identified by the probe path
 * they load. The probe appends them to `document.body`, outside any surface.
 */
export function probeFramesIn(parent: ParentNode): HTMLIFrameElement[] {
  return [...parent.querySelectorAll("iframe")].filter(
    (frame) => new URL(frame.src).pathname === PROBE_PATH
  );
}

/**
 * Let a launch reach its frame. The first launch in a file has a probe to
 * answer; every later one reads the verdict the page already holds and mounts
 * on a microtask, which the async `act` flushes.
 */
export async function settled(): Promise<void> {
  const [probe] = probeFramesIn(document.body);
  if (probe !== undefined) {
    deliver(probeMessage(true), probe.contentWindow);
  }
  await act(async () => {});
}

/** The frame the core mounted in `surface`. Throws if none has. */
export function frameIn(surface: Element): HTMLIFrameElement {
  const frame = surface.shadowRoot?.querySelector("iframe");
  if (!frame) throw new Error("no frame mounted in the surface");
  return frame;
}

/**
 * Dispatch a message as the browser would. `source` is assigned rather than
 * passed to the constructor because jsdom will not accept an arbitrary object
 * as a `WindowProxy` in `MessageEventInit`.
 */
export function deliver(data: unknown, source: Window | null): void {
  const event = new MessageEvent("message", { data, origin: ORIGIN });
  Object.defineProperty(event, "source", { value: source, configurable: true });
  act(() => {
    window.dispatchEvent(event);
  });
}

/** A completion, as the app posts it. Typed against the core's contract. */
export function successMessage(connectionIds: string[]): CompletionMessage {
  return {
    source: MESSAGE_SOURCE,
    version: CONTRACT_VERSION,
    event: EVENT_SUCCESS,
    connectionIds,
  };
}

export function closeMessage(): CompletionMessage {
  return {
    source: MESSAGE_SOURCE,
    version: CONTRACT_VERSION,
    event: EVENT_CLOSE,
  };
}

/**
 * The probe page's verdict, as it posts it from the hidden frame. Answering
 * `true` is what lets a launch mount its frame, and a message can only reach
 * a handler through that frame's window.
 */
export function probeMessage(supported: boolean): ProbeMessage {
  return {
    source: MESSAGE_SOURCE,
    version: CONTRACT_VERSION,
    event: EVENT_PROBE,
    payload: { supported },
  };
}
