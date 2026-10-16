---
"@catenaclearing/connect-sdk": minor
---

The overlay now has a close button, and Escape closes it while focus is on the overlay's own controls. Either one calls `onClose`, the same as a user closing the popup window, so a flow that never says it is done no longer leaves the user stuck behind the overlay. The flow comes off the overlay at once, and nothing it sends afterwards is delivered, but the overlay stays until you call `destroy()` from `onClose`, as the quick start does. An inline `container` gets no close button.
