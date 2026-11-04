---
"relkit": minor
"@relkit/cli": minor
"@relkit/drizzle": minor
---

An application can define several Drizzle services. Mark one with `defineDrizzleService({ default: true })`: it is `ctx.database`, the handle's `database` and the Better Auth database, while every service is available as `ctx.databases.<name>` when a function declares it under `dependencies.databases`, typed with that service's own models. A single service is the default without the flag; with several, `relkit check` requires exactly one.
