---
"relkit": patch
"@relkit/cli": patch
---

Fixed: a WebSocket upgrade to `/_relkit/v1/rpc` from a refused origin is answered with 403 and the
`origin-denied` Problem, as an HTTP request from that origin is, instead of a 500
`internal-error`. Through `relkit dev`, a refused upgrade is no longer a bare `502 Bad Gateway`:
on Node the development proxy repeats the application's status, content type and request id; on
Bun, whose WebSocket client does not report the status, the proxy refuses a foreign or opaque
`Origin` itself with 403 `origin-denied` and answers any other refusal with a 502 Problem, both
with an `x-request-id`. On Node a refused upgrade carries no body, because Hono's Node server
sends only the status and headers of a refused upgrade.
