---
"@catenaclearing/connect-sdk": patch
---

Calling `open()` again while the popup window is open now brings that window forward. Before, it focused the overlay behind it, or did nothing in a `container`, though the flow was in the window.
