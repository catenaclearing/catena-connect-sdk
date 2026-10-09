/**
 * The resume hook: the core's `resume()` on the page a redirected flow
 * returns to.
 *
 * Redirect mode leaves the launching page behind, so nothing of the launch
 * survives to deliver its outcome. The core keeps one record of the launch
 * across the navigation and delivers the declared outcome when the next page
 * asks. This hook asks on mount, which is when a route component on the
 * destination page is the right place to ask from.
 */

import {
  type ConnectCallbacks,
  type ResumeOptions,
  resume,
} from "@catenaclearing/connect-sdk";
import { useEffect, useRef } from "react";

import { forwardCallbacks, useLatest } from "./latest";

/**
 * Options for `useCatenaConnectResume()`: the core's `resume()` options,
 * unchanged. `outcome` says which destination page this is; the handlers are
 * the same six the launch takes.
 */
export type UseCatenaConnectResumeOptions = ResumeOptions;

/**
 * Deliver the outcome of a redirected flow on the page it returns to.
 *
 * Call it from the component rendered at each of your two destination URLs,
 * with `outcome: "success"` on one and `outcome: "exit"` on the other. If a
 * redirected launch went out from this tab and nothing has reported it yet,
 * the matching handler runs once, followed by `onClose`. The handler that
 * runs is the one from the most recent render.
 *
 * What it keys off is that record of a launch, not how this page was reached:
 * the core cannot tell. A page reached by an ordinary route is silent only
 * while no launch is pending. A redirected launch the user abandoned stays
 * recorded until it expires, and a mount inside that window consumes it and
 * reports the outcome you declared. So keep the hook to your two destination
 * pages, and treat a callback as evidence that a launch went out from this
 * tab, not as proof this page was reached from it.
 *
 * Delivery is tied to mount, not to render, so re-renders deliver nothing
 * further. Under React's strict mode in development, which mounts twice, the
 * outcome is still delivered once: the core consumes the record on the first
 * call and the second finds nothing. The flow's own documentation covers what
 * the record can and cannot carry across the navigation.
 */
export function useCatenaConnectResume(
  options: UseCatenaConnectResumeOptions
): void {
  const latest = useLatest(options);

  // Created once for the component's life, like the launch hook's.
  const forwarders = useRef<ConnectCallbacks | null>(null);
  if (forwarders.current === null) {
    forwarders.current = forwardCallbacks(latest);
  }

  // `latest` is a ref and never changes, so this runs on mount only. The
  // outcome is read from the first render: a page cannot change which
  // destination it is after it has loaded.
  useEffect(() => {
    resume({ outcome: latest.current.outcome, ...forwarders.current });
  }, [latest]);
}
