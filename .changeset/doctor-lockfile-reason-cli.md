---
"@relkit/cli": patch
---

When the frozen lockfile check fails, `relkit doctor` says why. Under `✗ lockfile: Frozen lockfile consistency check failed.` it prints the package manager's own first lines, such as npm's `Missing: left-pad@1.3.0 from lock file`, without npm's usage text, and `relkit doctor --json` carries the same lines in `checks[].details.reason` next to the `command` that was run. Credentials, registry logins and your project path in that output are masked.
