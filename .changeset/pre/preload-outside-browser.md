---
"@catenaclearing/connect-sdk": patch
---

`preload()` no longer throws during a server render. Outside a browser it now does nothing, so it is safe to call from code that also runs on the server, such as a Next.js or Remix component.
