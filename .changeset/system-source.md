---
"relkit": minor
"@relkit/cli": minor
"@relkit/inspector": minor
---

Calls made through `getRelkit()` and `createRelkit()` run with the new invocation source `system`, so traces, logs and `ctx.invocation.source` mark them as system calls, and the Inspector labels them "system call".
