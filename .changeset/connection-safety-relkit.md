---
"relkit": patch
---

An answer sent before the request body was read (origin denial, body limit, unknown route, wrong method, a route that requires a session, not ready) no longer leaves the connection in an unknown state: the server reads and discards the rest of the body up to `server.maxBodyBytes`, and answers with `Connection: close` when the body is larger than that or its size cannot be bounded.
