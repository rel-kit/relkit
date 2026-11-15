---
"relkit": patch
---

The Bun runtime adapter (the server of `relkit start` and of the `relkit dev` worker) never serves Bun's development error page, whatever `NODE_ENV` says: a failure outside the application's own error mapping answers a `500` Problem `internal-error` without paths or source. A `Host` that is not a host with an optional port answers a bare `400`, as on Node, instead of a `500`; a request without `Host` (HTTP/1.0) is served.

A Problem from an endpoint under `/_relkit/` (for example `404` for an unknown path such as `/_relkit/v1/nope`) now names the same `requestId` as its `x-request-id` header.
