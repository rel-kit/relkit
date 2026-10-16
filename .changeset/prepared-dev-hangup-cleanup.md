---
"@relkit/cli": patch
---

Handle SIGHUP through invocation cancellation so prepared development joins its
backend, inspector, and storage workers before exiting with status 129. Terminal
hangup now retains shutdown diagnostics instead of leaving orphaned children.
