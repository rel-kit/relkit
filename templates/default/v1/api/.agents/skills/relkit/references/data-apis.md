# Database, authentication, cache, and storage

For the full `defineApp`, `defineEnv`, provider profile, and environment binding workflow, read [Application configuration and environments](config-environments.md).

The database and auth integrations are specialized services, separate from `defineService` domain maps. `relkit add database` creates the Drizzle baseline in `src/services/database`; `relkit add auth` creates `src/services/auth` and its recognized `ALL` handler route. There should be one of each. Extend an existing one while preserving schema exports, environment fields, and routes.

## `defineEnv` and `defineDrizzleService`

```ts
import { defineEnv, env as envFactory } from "@relkit/app/config";

export default defineEnv({
  DATABASE_PATH: envFactory.string().default(".relkit/app.sqlite"),
  BETTER_AUTH_SECRET: envFactory.secret(),
});
```

```ts
import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => drizzle({ client: new Database(env.DATABASE_PATH, { create: true }) }),
  dispose: (database) => database.$client.close(),
});
```

Open the native connection in the `client({ env })` factory and close it with `dispose` when needed. Discovery does not run the factory. Generate and review migrations with the installed Drizzle tooling; service creation does not create tables or apply migrations. After `bun run check`, generated context declarations provide typed `context.database`.

For a model callback that uses the native database, import `defineModel` from the selected dialect leaf: `@relkit/drizzle/sqlite`, `/pg` or `/mysql`. This keeps other drivers outside the declaration closure. A MySQL development/typecheck installation also supplies `mysql2` for the upstream native database declarations.

## Version and apply migration source

New grouped scaffolds configure `src/services/database/migrations` beside the database service and schema. Keep SQL and required Drizzle metadata in Git, outside ignored `.relkit/`. One shared database has one ordered history, including authentication tables; do not create separate histories for business services. Existing flat apps retain their selected database service directory.

Set the required environment in the application root's `.env` or shell, then run:

```sh
bun run db:generate
# Review the generated SQL and metadata before applying them.
bun run db:migrate
```

`db:generate` uses the installed Drizzle Kit. `db:migrate` invokes installed RELKIT tooling, `relkit db migrate`, without copying a runner into the app. Root `drizzle.config.ts` explicitly owns dialect, schema, migration output, connection and supported log options. To select another config, use `bun run relkit db migrate --config configs/database.ts`; relative output/database paths still use the application root. Keep delegated PostgreSQL/MySQL config deterministic because Kit loads it again. Existing shell variables take precedence over Bun's normal dotenv loading; `.env.example` is documentation only.

Migration applies pending SQL only when explicitly invoked; scaffolding and service startup do not apply it, generate secrets or open the database. SQLite uses the Bun-native driver. PostgreSQL/MySQL delegate to the app's installed Kit under Bun. Missing/empty/incompatible history requires generation or a compatible ORM/Kit pair, not a reset or fallback directory. Review failures before another manual run: SQL is not automatically retried, and dialect-specific partial DDL is not guaranteed to roll back. Keep the generated dependency patch and registration while required by the installed release.

## `defineBetterAuthService`

```ts
import { defineBetterAuthService } from "@relkit/better-auth";

export default defineBetterAuthService({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
```

The root descriptor and session types remain available from `@relkit/better-auth`; native activation is owned by `@relkit/better-auth/drizzle` and selected by the server producer. Better Auth uses the same Drizzle connection and needs its tables in that schema. Mount `auth.handler` directly with `export const ALL = defineRoute({ handler: auth.handler })` under the auth base path. Supply a stable server-side `BETTER_AUTH_SECRET` and correct public `BETTER_AUTH_URL`; the scaffold only adds environment examples. Protect application routes and enforce ownership separately from signing in.

The selected auth scaffold keeps Better Auth 1.7.1 and the existing migration contract. It emits an override to the official `@better-fetch/fetch` 1.3.2 typing fix for Bun/npm and pnpm, and installs `@cloudflare/workers-types` 4.20250121.0 as a development-only requirement of the upstream D1 declarations. Preserve these fields and the separate Drizzle patch when extending the project; none applies SQL.

## `defineCache` and `defineBucket`

```ts
import { defineCache } from "@relkit/app/cache";
import { z } from "@relkit/app/schema";

export default defineCache({
  id: "orders.prices",
  profile: "requests",
  key: z.object({ sku: z.string() }),
  value: z.number().int().nonnegative(),
  defaultTtlMs: 60_000,
  maxTtlMs: 300_000,
});
```

```ts
import { defineBucket } from "@relkit/app/buckets";

export default defineBucket({
  id: "assets.objects",
  profile: "assets",
  visibility: "private",
  maxObjectBytes: 5_000_000,
  allowedContentTypes: ["application/json", "image/*"],
});
```

Configure compatible profiles in `relkit.config.ts` and declare each resource in a function's `dependencies` before using its checked context client. A profile selects a provider; the descriptor does not create Redis, S3, or credentials. Use `bun run relkit local status` to inspect Docker-backed resources.
