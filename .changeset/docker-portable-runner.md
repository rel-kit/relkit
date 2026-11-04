---
"@relkit/docker": patch
---

The Docker integration runs `docker` through `node:child_process` instead of `Bun.spawn`, so local services work when the CLI runs on Node. Timeouts, output limits, cancellation and the error codes are unchanged.
