---
"relkit": patch
---

Fixed: `relkit` now depends on `@hono/node-server` 2.1.6 instead of 2.1.5, so a fresh `npm install`
no longer reports the two moderate advisories that 2.1.5 carries (an unhandled `ECONNRESET` on the
socket during a WebSocket upgrade, and a backslash in the request path parsed as a path
separator), which `npm audit` attributed to every `@relkit/*` package. A request whose path
contains a raw backslash is now answered 400 by the Node server; a percent-encoded backslash
(`%5C`) is still accepted.

Projects with authentication get Better Auth 1.7.7, which closes the Better Auth advisories
`npm audit` reported for 1.7.1; see the Better Auth changeset.
