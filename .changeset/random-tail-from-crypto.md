---
"@catenaclearing/connect-sdk": patch
---

The popup's window name and the redirect-mode resume record's id now take their random part from `crypto.getRandomValues` instead of `Math.random`. Neither value was ever a secret, but security scanners flagged the `Math.random` calls in the bundle as a weak random number generator. They no longer do. Behavior is otherwise unchanged.
