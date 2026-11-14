---
"@relkit/drizzle": patch
---

`@relkit/drizzle/pg` exports `openPostgresDatabase(url, config?)` and `@relkit/drizzle/mysql`
exports `openMysqlDatabase(url, config?)`. Like `openSqliteDatabase`, each uses the driver of the
runtime the application runs on: Bun's built-in SQL client on Bun, `pg` or `mysql2` on Node. Only
that runtime's driver is loaded, so a Bun application needs no driver package and a Node
application never loads `bun`. End the connections with `database.$client.end()`.
