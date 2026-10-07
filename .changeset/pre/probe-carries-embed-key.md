---
"@catenaclearing/connect-sdk": minor
---

The capability probe now carries your embed key, so a page whose origin is not registered against the key, or a launch with an unknown or revoked key, falls back to the Continue button and a popup instead of mounting a frame the browser refuses to render.

The probe's verdict is now held per origin and embed key. `preload()` accepts an optional `embedKey`: pass the key your launch uses and the next `open()` skips the loading state as before. Without it, `preload()` probes as it did, and an `open()` with a key runs its own probe. The fallback takes effect as the connect app starts scoping the probe to the key.
