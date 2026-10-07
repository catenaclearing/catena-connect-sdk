---
"@catenaclearing/connect-sdk": major
---

Add the embed API: `open()` launches the Catena Connect flow from your page, reports the outcome through five typed callbacks, and falls back from a frame to a window to the current tab so every user reaches the end of the flow. The `PACKAGE_NAME` placeholder export is removed.

**Migrating from 0.0.x.** Those releases were a typed skeleton with no runtime behavior, so nothing carries over except `PACKAGE_NAME`, which is gone: if you read it, inline the string. This is the first release with an implementation behind it. The README has the full reference, `resume()` and `preload()` included, and the versioning and support policy that applies from here.
