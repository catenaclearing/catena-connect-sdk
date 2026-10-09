/**
 * Catena Connect for React.
 *
 * `useCatenaConnect()` launches the flow from an event and tears it down on
 * unmount, `<CatenaConnect />` renders it inline, and
 * `useCatenaConnectResume()` delivers a redirected flow's outcome on the page
 * it returns to. Nothing else is exported.
 *
 * The core's types a consumer of these hooks can meet are re-exported, so
 * imports come from one package. The core's `open`, `resume` and `preload`,
 * and with them `CatenaConnectHandle` and `PreloadOptions`, are deliberately
 * not: the hooks are their React form, the handle never leaves the hook, and
 * a second way in would invite the handle-in-a-ref pattern this package
 * exists to remove.
 */

export type {
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
  ResumeOptions,
  ResumeOutcome,
} from "@catenaclearing/connect-sdk";
export { CatenaConnect, type CatenaConnectProps } from "./catena-connect";
export {
  type UseCatenaConnectOptions,
  type UseCatenaConnectResult,
  useCatenaConnect,
} from "./use-catena-connect";
export {
  type UseCatenaConnectResumeOptions,
  useCatenaConnectResume,
} from "./use-catena-connect-resume";
