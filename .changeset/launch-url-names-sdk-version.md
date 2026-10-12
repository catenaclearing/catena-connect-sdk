---
"@catenaclearing/connect-sdk": minor
---

The launch URL now carries `sdk_version`, set to this package's version, so the flow can tell which release launched a session. Nothing changes for callers, and a launch URL you build by hand should leave it off. The `@catenaclearing/connect-sdk/contract` entry adds `SDK_VERSION` and `SDK_VERSION_PARAM`.
