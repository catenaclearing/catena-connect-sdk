---
"@catenaclearing/connect-sdk": patch
---

A network that is slow on every request, not only the first, no longer sends a browser that supports the iframe to the "Continue in a new window" fallback.

Once the iframe check's page has loaded, it now has six seconds to report rather than two and a half, which covers its cookie round trip on a connection that adds about two seconds to each request. A frame that loads and never answers, such as on an origin your embed key does not cover, now waits that long before offering the window.
