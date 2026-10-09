---
"@catenaclearing/connect-sdk": patch
---

Fix the inline flow when `container` sits in a different document from the one the SDK runs in, such as a modal inside a same-origin frame with `open()` called from the top window. The flow showed as an unstyled 300×150 frame and its callbacks never arrived; it now fills the container and delivers every event.
