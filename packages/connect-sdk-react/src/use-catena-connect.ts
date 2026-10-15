/**
 * The launch hook: the core's `open()` as a React component uses it.
 *
 * The hook holds the handle, tears the launch down when the component
 * unmounts, and hands the core six stable callbacks that read the current
 * handler at delivery time (see `latest.ts`). What it does not do is change
 * the flow: every option is the core's, with the core's meaning and default.
 */

import {
  type CatenaConnectHandle,
  type CatenaConnectOptions,
  type ConnectCallbacks,
  open as openFlow,
  preload as preloadFlow,
} from "@catenaclearing/connect-sdk";
import { type RefObject, useCallback, useEffect, useRef } from "react";

import { forwardCallbacks, useLatest } from "./latest";

/**
 * Every launch a hook instance in this page started.
 *
 * The core allows one launch at a time and answers a second `open()` with the
 * live launch's own handle. That is the right behavior for a double click,
 * and the wrong thing for a second component to keep: its unmount would tear
 * down a flow another component is still standing behind. So a handle is
 * stored only by the instance whose call created it, and a focus of someone
 * else's launch stores nothing. Weak, so a handle lives no longer than the
 * launch it belongs to.
 */
const started = new WeakSet<CatenaConnectHandle>();

/**
 * Options for `useCatenaConnect()`. The core's `open()` options, with three
 * differences for a component's life cycle.
 */
export interface UseCatenaConnectOptions
  extends Omit<CatenaConnectOptions, "inviteUrl" | "container"> {
  /**
   * The invitation URL you were issued. May be `null` or `undefined` while
   * your application is still loading it; `open()` throws until it is there.
   */
  inviteUrl: string | null | undefined;
  /**
   * Mount the flow inline in this element instead of in the overlay. A ref,
   * read when `open()` is called, so it may point at an element rendered by
   * the same component.
   */
  container?: RefObject<HTMLElement | null>;
  /**
   * Resolve the mode decision while the component is mounted, so the first
   * launch starts loading the flow without waiting on that decision. Runs
   * whenever `inviteUrl` or `embedKey` changes and never throws. Defaults to
   * `true`; set `false` to leave the decision until `open()`.
   */
  preload?: boolean;
}

/**
 * Launch options for `openWith()`, each taking the place of the value from
 * the latest render for this one launch. Handlers are not among them: the
 * handler that runs is always the one from the latest render.
 */
export type UseCatenaConnectOpenOptions = {
  [K in keyof LaunchOptions]?: LaunchOptions[K] | undefined;
};

/**
 * The hook's options that describe a launch. `undefined` is spelled out on
 * every key of the type above because passing it replaces the rendered value,
 * and `exactOptionalPropertyTypes` would otherwise reject it.
 */
type LaunchOptions = Omit<
  UseCatenaConnectOptions,
  keyof ConnectCallbacks | "preload"
>;

/** What `useCatenaConnect()` returns. Every function is stable across renders. */
export interface UseCatenaConnectResult {
  /**
   * Launch the flow with the options as of the latest render, or bring the
   * live surface back if a launch is already up. Throws when `inviteUrl` is
   * absent, and whatever the core's `open()` throws on an invalid URL.
   *
   * A value set in the same event handler has not rendered yet, so `open()`
   * cannot see it. To launch with a value you have only just obtained, such
   * as an invitation fetched on click, pass it to `openWith()`.
   */
  open(): void;
  /**
   * `open()`, with the given options in place of the latest render's for this
   * launch. Any option passed, `undefined` included, replaces the rendered
   * one; options left out keep their rendered value.
   */
  openWith(options: UseCatenaConnectOpenOptions): void;
  /**
   * Tear the current launch down: its surface, the frame or window it opened,
   * and its listeners. Safe to call at any point, including with nothing
   * launched. The component's unmount does this for you.
   */
  destroy(): void;
}

/**
 * Launch the flow from an event handler, and have it torn down when the
 * component unmounts.
 *
 * Handlers follow the render: the one that runs is the one you passed most
 * recently, and changing a handler never relaunches. Launch options
 * (`inviteUrl`, `embedKey`, `container`, the presentation options) are fixed
 * for the lifetime of a launch, as in the core; new values apply to the next
 * `open()`. One launch at a time across the whole page: a second `open()`,
 * from this component or any other, focuses the live surface and does not
 * take it over. Only the component that launched a flow tears it down.
 *
 * Use one way in per page. The hook can tell its own launches apart, not a
 * flow the core's own `open()` started: that one it would take for its own
 * and tear down on unmount. A React page drives the flow through this
 * package alone, which is why the core's `open()` is not re-exported.
 */
export function useCatenaConnect(
  options: UseCatenaConnectOptions
): UseCatenaConnectResult {
  const latest = useLatest(options);

  // Created once for the component's life, so every launch is handed the same
  // six functions. Lazily, because `forwardCallbacks` only needs the ref.
  const forwarders = useRef<ConnectCallbacks | null>(null);
  if (forwarders.current === null) {
    forwarders.current = forwardCallbacks(latest);
  }

  const handle = useRef<CatenaConnectHandle | null>(null);

  // Whether the component has gone. `open()` can run while it is going: the
  // core delivers `onClose` synchronously when a launch replaces a finished
  // one, and the handler may unmount this component.
  const unmounted = useRef(false);

  const openWith = useCallback(
    (overrides: UseCatenaConnectOpenOptions): void => {
      const {
        inviteUrl,
        container,
        preload: _,
        ...launchOptions
      } = { ...latest.current, ...overrides };

      // A programming error, not a state to wait out: swallowing it would hide
      // a button wired up before the invitation arrived.
      if (inviteUrl === null || inviteUrl === undefined) {
        throw new Error(
          "useCatenaConnect: inviteUrl is required to open the flow"
        );
      }

      // A component that has unmounted has nothing left to own a launch.
      if (unmounted.current) return;

      const launched = openFlow({
        ...launchOptions,
        inviteUrl,
        container: container?.current ?? undefined,
        ...forwarders.current,
      });

      // The unmount happened inside the call above, from a handler the core
      // delivered on the way to this launch. Its cleanup ran before there was a
      // handle to clean up, so the new launch would be stranded on the page
      // with nothing to tear it down.
      if (unmounted.current) {
        // Only when this call created the launch. A focus of another
        // component's live flow is not this component's to end.
        if (!started.has(launched)) launched.destroy();
        return;
      }

      // The core answered with a launch that already existed. Our own, on a
      // double click, is already stored; another component's is theirs to keep
      // and theirs to tear down.
      if (started.has(launched)) return;

      started.add(launched);
      handle.current = launched;
    },
    [latest]
  );

  const open = useCallback((): void => openWith({}), [openWith]);

  const destroy = useCallback((): void => {
    handle.current?.destroy();
    handle.current = null;
  }, []);

  useEffect(() => {
    // Reset on every run, not just the first: strict mode in development
    // runs this cleanup and then mounts the component again.
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      destroy();
    };
  }, [destroy]);

  // An optimization, never a requirement, so nothing is awaited and nothing
  // is torn down: the verdict lands in the core's cache, which is where
  // `open()` reads it from. Two options matter here. The invite URL names the
  // origin to probe, and the embed key is part of what the verdict is about:
  // the core holds one per origin and key, so warming without the key the
  // launch carries would leave `open()` a probe of its own to run.
  const { inviteUrl, embedKey, preload } = options;
  useEffect(() => {
    if (preload === false || !inviteUrl) return;
    preloadFlow({ inviteUrl, embedKey });
  }, [preload, inviteUrl, embedKey]);

  return { open, openWith, destroy };
}
