---
"@relkit/cli": patch
---

The `relkit dev` proxy no longer answers a bare `400` to the request that follows an early rejection on the same connection. Bun's fetch kept the connection to the worker in its pool after the worker answered before the request body was sent, so the worker read the next request as the rest of that body; the proxy now never reuses a connection that carried a request body, tells the client to close when the worker answered before the client's body ended, and forwards the client's `Content-Length` so the worker applies its body limit as in production. The proxy also forwards request bodies on Node, which refused them before.
