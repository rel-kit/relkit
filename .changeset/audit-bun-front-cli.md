---
"@relkit/cli": patch
---

The `relkit dev` front, on Bun and on Node:

- A missing or malformed `Host` no longer answers Bun's `500` error page with the CLI's source paths: a `Host` that is not a host with an optional port answers a bare `400`, and a request without `Host` (HTTP/1.0) or with an empty one is served with the front's own address. No failure of the front serves Bun's error page; it answers a `500` Problem `internal-error`.
- The path the front checks is the path it forwards: a `Host` carrying a path no longer changes the route, and a path starting with `//` answers `404` on both runtimes instead of reaching the application (and its inspection endpoints) on Bun.
- A `GET`, `HEAD` or `OPTIONS` that carries a body no longer makes the next request, from any client, answer `400` or nothing on Bun: a `Content-Length` is forwarded only with its body.
- The `404` for a blocked inspection path names the same `requestId` as its `x-request-id` header.
- A client that disconnects before reading the body no longer prints `Error: aborted` in the terminal.

When the new version stops before it is ready after reporting a coded startup failure (such as `RELKIT_PROVIDER_CONFIGURATION_INVALID` with `--local off` and a local-only binding), `relkit dev` now ends with that code, its message and its next step instead of `RELKIT_INTERNAL_ERROR` and a request to report a bug.
