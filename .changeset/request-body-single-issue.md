---
"@relkit/runtime-hono": patch
---

A request body that cannot be read, such as malformed JSON, the wrong content type or a body over the size limit, is now reported as one validation issue for the whole body (`path: []`) instead of the same issue repeated once for every body field.
