---
"@catenaclearing/connect-sdk": patch
---

When the page that called `open()` is inside a frame and the browser blocks the popup, the surface now asks the user to allow pop-ups and press Continue again. Before, it fell back to the redirect mode, which in a frame navigates only the frame and loads the flow somewhere it cannot run.
