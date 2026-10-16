---
"@catenaclearing/connect-sdk-react": patch
---

`useCatenaConnect()`'s `open()` now throws when `container` is given but its ref is not attached to an element, instead of opening the flow in the full-page overlay. A throwing handler under `useCatenaConnectResume()` no longer reaches your error boundary. Its exception is rethrown in a separate task, the same way a throw from a handler in the other modes is. `<CatenaConnect />` now declares its return type as `ReactElement`, a type every `@types/react` 18 release exports, and its documentation says that an `inviteUrl` the core refuses throws from its mount effect.
