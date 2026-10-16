---
"@catenaclearing/connect-sdk": minor
---

The package now ships a browser build for pages without a bundler. Load `dist/connect-sdk.global.js` from a CDN such as jsDelivr or unpkg with a `<script>` tag, pinned to an exact version and an integrity hash, and call `CatenaConnect.open`, `resume` and `preload` the same way as the imported functions.
