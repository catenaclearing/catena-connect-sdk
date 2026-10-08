---
"@catenaclearing/connect-sdk": patch
---

A slow first connection no longer sends a browser that supports the iframe to the "Continue in a new window" fallback.

The iframe check now allows up to eight seconds for its page to arrive and keeps a short limit once it has loaded. A check that times out is no longer remembered for the rest of the page, so the next launch checks again. Each popup window also gets its own name, which stops Chrome logging "Unsafe attempt to initiate navigation" when a window from an earlier page is still open. Calling `preload()` when your page loads is now recommended on slow networks.
