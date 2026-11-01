---
"@relkit/runtime-hono": patch
---

Requests that match no route now receive JSON like other framework errors: `404 {"error":"not-found"}` instead of the plain-text `404 Not Found`. When the path exists under other methods, the response is `405 {"error":"method-not-allowed"}` with an `Allow` header listing them.
