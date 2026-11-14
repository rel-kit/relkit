---
"@relkit/cli": patch
---

On Node, `relkit db migrate`, `relkit env check` and `relkit env list` now read the application's
environment files (`.env`, `.env.<mode>`, `.env.local` outside test, `.env.<mode>.local`), as Bun
already did. A value already set in the process environment takes precedence over the files.
`relkit db migrate` on Node also finds an installed drizzle-kit that does not export its
`package.json`, so PostgreSQL and MySQL migrations run through `npm run`.

When the Drizzle configuration fails to load, `relkit db migrate` now shows the configuration's
own message, such as `Set DATABASE_URL to the database you intend to migrate`, with credentials in
URLs and `password=`-style values masked. A configuration that imports a package that is not
installed is reported as a missing dependency instead.

`relkit db migrate` now says what it did: `Applied 2 migrations; the database is up to date.` or
`Database is up to date: no migrations were pending.`. The JSON result gains `history` (migrations
in the history folder) and, when the CLI could read the migration log, `applied`. SQLite always
reports the count; PostgreSQL reports it when the application uses `pg`, and otherwise says the
database matches the history without claiming work. The message for a missing migration history
names the project's package manager (`npm run db:generate`, `pnpm run db:generate`), and
`relkit db migrate --help` lists the environment files the configuration reads.
