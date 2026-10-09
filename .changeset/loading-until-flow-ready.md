---
"@catenaclearing/connect-sdk": patch
---

The iframe mode keeps its loading state, now with a spinner, until the flow reports it is ready, instead of removing it as the iframe mounts. Users no longer see a blank surface for the few seconds the flow takes to draw. If the flow never reports, the iframe is shown three seconds after it loads.
