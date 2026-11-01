---
"@relkit/runtime-hono": patch
---

Requests that return a 4xx response without throwing are no longer recorded as successful. Raw routes such as Better Auth, unknown-route 404s and middleware rejections returned their error response directly, so traces and request records showed `success` next to `HTTP 400`. A response that is still `success` when it finishes is now classified by its status: 400 and 422 as `validation-error`, other 4xx as `declared-error`, and 5xx as `defect` as before. Failures already recorded from a thrown error keep their outcome.
