---
"relkit": patch
---

Fixed: on Node, the 431 answer to a request with oversized headers carries `x-request-id`. Node's
HTTP parser refuses such a request before a route is chosen; RelKit's Node adapter now writes that
answer. On Bun the runtime writes it before any RelKit code runs, so it has no request ID there.

The generated OpenAPI document has an `info.description` that says once what every route answers
without a listed operation: a `GET` route also answers `HEAD`, `OPTIONS` answers `204` with
`Allow`, and the HTTP server answers `431` before a route is chosen. With a mounted Better Auth
service, the served document's Authentication section also says that those operations answer errors
in Better Auth's format and not as Problem Details.
