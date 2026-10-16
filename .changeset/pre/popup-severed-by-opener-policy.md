---
"@catenaclearing/connect-sdk": patch
---

Warn in the console when the popup window reports itself closed within moments of opening. That is what a launching page served with `Cross-Origin-Opener-Policy: same-origin` does to it, and until now it looked like the user closing the window. The warning names the header and the fix, `same-origin-allow-popups`; `onClose` is still delivered as before. The README now lists the requirement under "What you need".
