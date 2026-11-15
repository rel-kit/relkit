---
"relkit": patch
---

Fixed: a WebSocket frame on `/_relkit/v1/rpc` that the RPC protocol cannot decode (text or bytes
that are not JSON, `null`, a message without an id or a request URL) closes the socket with
`1007` and "RelKit RPC frame is not valid." instead of `1011` "RelKit RPC transport failed.",
which now remains for failures of the server itself.
