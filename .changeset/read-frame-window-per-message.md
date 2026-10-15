---
"@catenaclearing/connect-sdk": patch
---

Deliver the flow's callbacks from a frame whose container was attached after `open()`, or moved by a portal after the flow mounted. The frame's window is now read on each message rather than taken once at mount; before, both cases left every callback silently dropped while the flow itself ran on.
