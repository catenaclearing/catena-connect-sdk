---
"@catenaclearing/connect-sdk": minor
---

The overlay now has a close button, and Escape closes it while focus is on the overlay's own controls. Either one calls `onClose`, the same as a user closing the popup window, so a flow that never says it is done no longer leaves the user stuck behind the overlay. The package still removes nothing itself: call `destroy()` from `onClose`, as the quick start does. An inline `container` gets no close button.
