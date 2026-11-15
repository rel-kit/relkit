---
"relkit": patch
---

Fixed: `relkit` now depends on `@hono/node-server` 2.1.6 instead of 2.1.5, so a fresh `npm install`
no longer reports the two moderate advisories that 2.1.5 carries (an unhandled `ECONNRESET` on the
socket during a WebSocket upgrade, and a backslash in the request path parsed as a path
separator), which `npm audit` attributed to every `@relkit/*` package. A request whose path
contains a raw backslash is now answered 400 by the Node server; a percent-encoded backslash
(`%5C`) is still accepted.

`better-auth` stays at 1.7.1, so `npm audit` still reports advisories in projects that use
authentication: a critical one in `better-auth` (OAuth Proxy and OAuth state sign-in as another
user, GHSA-r4xp-prcw-77qf and GHSA-965c-763c-88jm) and a low one in `@better-auth/drizzle-adapter`
(concurrent requests can exceed rate limits on PostgreSQL, GHSA-44jh-23m7-hpcf). All three are
fixed in 1.7.7, but from that release Better Auth checks the Drizzle schema at startup and rejects
the required `account.issuer` column that Better Auth 1.7.0 through 1.7.2 added and that the
schema RelKit generates still declares, so every sign-up would fail until the schema and existing
projects are migrated. Move to 1.7.7 or later together with that migration.
