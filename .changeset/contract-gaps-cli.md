---
"@relkit/cli": patch
---

Fixed: under `relkit dev`, the response of the client's live update stream
(`GET /_relkit/v1/client/contract-events`) carries `x-request-id`, as every other answer of the
development port does.
