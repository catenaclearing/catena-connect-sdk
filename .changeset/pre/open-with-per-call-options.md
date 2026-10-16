---
"@catenaclearing/connect-sdk-react": minor
---

`useCatenaConnect()` now also returns `openWith(options)`, which launches with the options you pass in place of the latest render's. Use it when you fetch the invitation on click: `open()` reads the latest render, so `setInviteUrl(url); open();` in one handler launched the previous invitation, or threw if there was none. `open()` itself is unchanged and still takes no argument, so `onClick={open}` keeps working.
