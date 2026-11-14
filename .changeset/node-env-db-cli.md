---
"@relkit/cli": patch
---

On Node, `relkit db migrate`, `relkit env check` and `relkit env list` now read the application's
environment files (`.env`, `.env.<mode>`, `.env.local` outside test, `.env.<mode>.local`), as Bun
already did. A value already set in the process environment takes precedence over the files.
`relkit db migrate` on Node also finds an installed drizzle-kit that does not export its
`package.json`, so PostgreSQL and MySQL migrations run through `npm run`.
