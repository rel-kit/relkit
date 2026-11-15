---
"@relkit/client": patch
---

A read that rejects after its caller aborted no longer surfaces as an unhandled rejection. When the abort had already happened, the abort helper returned its own rejection and left the abandoned read's rejection without a handler; on Node an unhandled rejection can end the process.
