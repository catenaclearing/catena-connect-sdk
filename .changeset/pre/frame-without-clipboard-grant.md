---
"@catenaclearing/connect-sdk": patch
---

The flow's iframe no longer carries `allow="clipboard-write"`. The flow never uses the clipboard, so the grant gave a cross-origin frame a permission it had no use for.
