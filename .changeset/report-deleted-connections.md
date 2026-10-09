---
"@catenaclearing/connect-sdk": minor
"@catenaclearing/connect-sdk-react": minor
---

Add `onConnectionDeleted`, called with `{ connectionId }` when the fleet deletes a connection from the flow. Like `onConnection` it does not end the flow. Use it to drop an id you stored from an earlier `onConnection` without waiting for your webhooks. The `ConnectConnectionDeletedEvent` type is exported from both packages.
