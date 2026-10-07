/**
 * The inline component: the launch hook on an element it renders itself.
 *
 * The component exists for the case where the flow is part of the page rather
 * than a modal over it. It owns one `div`, launches into it when it mounts,
 * and tears the launch down when it unmounts. Everything about the flow is
 * the hook's, and through it the core's.
 */

import type { CatenaConnectOptions } from "@catenaclearing/connect-sdk";
import { type HTMLAttributes, type JSX, useEffect, useRef } from "react";

import { useCatenaConnect } from "./use-catena-connect";

/**
 * Props for `<CatenaConnect />`: the core's launch options, minus `container`
 * (the component is the container), plus the attributes a `div` takes. No
 * children and no `dangerouslySetInnerHTML`: the flow owns the element's
 * contents.
 */
export type CatenaConnectProps = Omit<CatenaConnectOptions, "container"> &
  Omit<
    HTMLAttributes<HTMLDivElement>,
    keyof CatenaConnectOptions | "children" | "dangerouslySetInnerHTML"
  >;

/**
 * The option names, so a prop can be told from an attribute without a guess.
 * `satisfies` keeps the list honest: it fails to compile when the core adds
 * an option this list does not name, or when the list names one it dropped.
 */
const OPTION_KEYS = {
  inviteUrl: true,
  embedKey: true,
  variant: true,
  theme: true,
  logoUrl: true,
  logoUrlDark: true,
  brandColor: true,
  onOpen: true,
  onConnection: true,
  onSuccess: true,
  onExit: true,
  onClose: true,
} satisfies Record<keyof Omit<CatenaConnectOptions, "container">, true>;

// A set rather than an `in` check, which would also answer yes for anything
// on `Object.prototype` and let a prop named `constructor` onto the launch.
const optionKeys: ReadonlySet<string> = new Set(Object.keys(OPTION_KEYS));

// The props that would take the element away from the component: the two
// that put a caller's content inside it, and the ref the flow is mounted
// through (React 19 delivers `ref` as a plain prop, and a spread would
// replace ours). The type leaves them out; this keeps a caller outside
// TypeScript out as well.
const ownedKeys: ReadonlySet<string> = new Set([
  "children",
  "dangerouslySetInnerHTML",
  "ref",
]);

type OptionProps = Omit<CatenaConnectOptions, "container">;
type ElementProps = Omit<CatenaConnectProps, keyof OptionProps>;

/**
 * Split the props into what the launch takes and what the element takes.
 * Only a known option name goes to the launch, so an attribute the core does
 * not know about never rides on the launch URL, and an option never lands on
 * the `div` as a stray attribute. The props the component owns go nowhere.
 */
function split(props: CatenaConnectProps): [OptionProps, ElementProps] {
  const options: Record<string, unknown> = {};
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (ownedKeys.has(key)) continue;
    (optionKeys.has(key) ? options : attributes)[key] = value;
  }
  return [options as OptionProps, attributes as ElementProps];
}

/**
 * Render the flow inline, in an element this component owns.
 *
 * The component renders one `div` and launches the flow into it as soon as
 * it mounts. Size this element; the flow fills it. `className`, `style`,
 * `id`, `data-*` and ARIA attributes go onto the `div`; the rest of the props
 * are the launch options and the event handlers, exactly as the core takes
 * them. The element itself is the component's: children,
 * `dangerouslySetInnerHTML` and `ref` are not accepted.
 *
 * A launch is fixed for its lifetime, as in the core: changing `inviteUrl`,
 * `embedKey` or a presentation prop does not touch the flow on the page.
 * Change `key` to relaunch with new options. Handlers follow the render, so a
 * new `onSuccess` is the one that runs at the next delivery.
 *
 * Unmounting tears the launch down and leaves the page as it was. Under
 * React's strict mode in development the first launch is torn down and a
 * second one started; one surface is visible either way.
 */
export function CatenaConnect(props: CatenaConnectProps): JSX.Element {
  const [options, attributes] = split(props);
  const container = useRef<HTMLDivElement>(null);

  // The component launches as soon as it mounts, so there is no window in
  // which a preload could have resolved the mode decision ahead of it.
  const { open, destroy } = useCatenaConnect({
    ...options,
    container,
    preload: false,
  });

  useEffect(() => {
    open();
    return destroy;
  }, [open, destroy]);

  return <div ref={container} {...attributes} />;
}
