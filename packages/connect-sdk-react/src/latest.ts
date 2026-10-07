/**
 * Handlers that follow the render.
 *
 * The core captures its options at `open()`. That is right for the launch
 * URL, which must not move while a flow is in progress, and wrong for the
 * handlers, which a React component rewrites on every render. So the hooks
 * hand the core five stable functions that read the current handler through
 * a ref at delivery time. A re-render replaces what the ref holds; nothing is
 * relaunched.
 */

import type { ConnectCallbacks } from "@catenaclearing/connect-sdk";
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

/**
 * A layout effect in the browser, a plain effect on the server.
 *
 * React 18 warns on `useLayoutEffect` during server rendering, and the effect
 * has no DOM to run against there anyway. In the browser the layout timing
 * matters: it runs before a `message` event, which is a macrotask, can be
 * delivered, so a handler replaced in the same render as an inbound event is
 * already in place.
 */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A ref that always holds the value from the most recent render. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Five forwarding callbacks over a ref of the latest handlers.
 *
 * Created once per call and never again, so a hook can hold the result in a
 * ref and pass the same functions to every launch.
 */
export function forwardCallbacks(
  latest: RefObject<ConnectCallbacks>
): ConnectCallbacks {
  return {
    onOpen: (event) => latest.current.onOpen?.(event),
    onConnection: (event) => latest.current.onConnection?.(event),
    onSuccess: (event) => latest.current.onSuccess?.(event),
    onExit: (event) => latest.current.onExit?.(event),
    onClose: (event) => latest.current.onClose?.(event),
  };
}
