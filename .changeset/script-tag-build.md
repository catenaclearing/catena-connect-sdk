---
"@catenaclearing/connect-sdk": minor
---

Adds a browser build for pages without a bundler. Load `dist/connect-sdk.global.js` from a CDN such as jsDelivr or unpkg with a `<script>` tag, pinned to an exact version with an integrity hash, and call `CatenaConnect.open`, `resume` and `preload` as you would the imports.
