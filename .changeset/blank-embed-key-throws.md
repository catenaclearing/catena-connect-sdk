---
"@catenaclearing/connect-sdk": patch
"@catenaclearing/connect-sdk-react": patch
---

`open()` now throws a `TypeError` when `embedKey` is empty, whitespace or not a string, instead of launching a flow the connect app refuses to show in a frame. `preload()` skips such a key without throwing. With `<CatenaConnect>`, the throw reaches your nearest error boundary, as an invalid invite URL already does.
