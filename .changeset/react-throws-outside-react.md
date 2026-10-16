---
"@catenaclearing/connect-sdk-react": patch
---

`useCatenaConnect()`'s `open()` now throws when `container` is given but its ref is not attached to an element, instead of opening the flow in the full-page overlay. A throwing handler under `useCatenaConnectResume()` no longer reaches your error boundary: its exception is rethrown from a task of its own, as a throw from the other modes' handlers is. `<CatenaConnect />` now declares its return type as `ReactElement`, which every `@types/react` 18 exports, and its documentation says that an `inviteUrl` the core refuses throws from its mount effect.
