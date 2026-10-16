---
"@catenaclearing/connect-sdk": patch
---

A relaunch now goes ahead when the finished launch's `onClose` throws. Before, the exception escaped `open()`, the old surface stayed up and the user had to click twice. The error is still reported, from its own task, the way an error from any other callback is.
