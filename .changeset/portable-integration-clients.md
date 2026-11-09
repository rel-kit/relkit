---
"@relkit/redis": minor
"@relkit/sentry": minor
"@relkit/drizzle": minor
---

Redis, Sentry and SQLite run on Node as well as Bun. `@relkit/redis` keeps Bun's built-in client on Bun and uses `ioredis` on Node, with the same no-retry, no-offline-queue policy. `@relkit/sentry` loads `@sentry/bun` on Bun and `@sentry/node` on Node, so `relkit add sentry` installs both. `openSqliteDatabase(path)` from `@relkit/drizzle/sqlite` opens a Drizzle SQLite database with `bun:sqlite` on Bun and `node:sqlite` on Node 22.13 or later.
