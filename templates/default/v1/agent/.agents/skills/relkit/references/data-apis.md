# Database, authentication, cache, and storage

For the full `defineApp`, `defineEnv`, provider profile, and environment binding workflow, read [Application configuration and environments](config-environments.md).

The database and auth integrations are specialized services, separate from `defineService` domain maps. `relkit add database` creates the Drizzle baseline in `src/database`; `relkit add auth` creates `src/auth` and its recognized `ALL` handler route. There should be one of each. Extend an existing one while preserving schema exports, environment fields, and routes.

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

## `defineBetterAuthService`

```ts
import { defineBetterAuthService } from "@relkit/better-auth";

export default defineBetterAuthService({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
```

Better Auth uses the same Drizzle connection and needs its tables in that schema. Mount `auth.handler` directly with `export const ALL = defineRoute({ handler: auth.handler })` under the auth base path. Supply a stable server-side `BETTER_AUTH_SECRET` and correct public `BETTER_AUTH_URL`; the scaffold only adds environment examples. Protect application routes and enforce ownership separately from signing in.

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
