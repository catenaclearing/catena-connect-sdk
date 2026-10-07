---
"@catenaclearing/connect-sdk": minor
---

Export the `ConnectConnectionEvent` type, the payload `onConnection` receives. It was defined but missing from the package's type exports, so a handler's parameter could not be named outside an inline function. The other four event payload types were already exported; nothing else changes.
