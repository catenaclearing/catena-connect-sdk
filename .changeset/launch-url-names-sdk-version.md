---
"@catenaclearing/connect-sdk": patch
---

The launch URL now carries `sdk_version`, set to this package's version, so the flow can tell which release launched a session. Nothing changes for callers. A launch URL you build by hand should leave it off.
