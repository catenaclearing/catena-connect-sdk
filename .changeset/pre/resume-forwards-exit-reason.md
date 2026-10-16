---
"@catenaclearing/connect-sdk": minor
---

`resume()` now passes `onExit` a reason read from the failure URL: its `skip_reason` when there is one, otherwise its `status`, such as `integration-requested`. The other two modes already report the same exit with that reason. Before, `resume()` always passed an empty string. It still does when the URL carries neither parameter.
