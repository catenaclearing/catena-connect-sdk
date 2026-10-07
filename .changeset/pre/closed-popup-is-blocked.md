---
"@catenaclearing/connect-sdk": patch
---

A popup the browser hands back already closed is now treated as blocked, so the flow continues in the current tab. Some blockers answer this way instead of refusing the window outright, and the launch used to report `onClose` with no outcome and never redirect.
