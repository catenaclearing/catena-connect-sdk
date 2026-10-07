---
"@catenaclearing/connect-sdk-react": patch
---

`useCatenaConnect` now passes your `embedKey` to the core's `preload()`, so the warmed verdict is the one the launch uses and the first `open()` still skips the loading state. Preloading also reruns when `embedKey` changes.
