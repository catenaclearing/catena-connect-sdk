---
"@catenaclearing/connect-sdk": patch
---

An iframe that loads but never reports it is ready now falls back to the popup, eight seconds after its page loads, instead of being shown. The usual cause is a browser refusing to render the flow in an iframe, which used to leave the user looking at the browser's error page with no callback to your page.
