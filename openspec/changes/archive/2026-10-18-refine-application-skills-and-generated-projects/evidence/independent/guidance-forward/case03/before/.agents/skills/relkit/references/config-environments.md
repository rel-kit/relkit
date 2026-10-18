# Application configuration and environments

A generated application has two authoring files at its root: `relkit.config.ts` declares topology and runtime policy with `defineApp`, and `src/platform/env.ts` declares application environment values with `defineEnv`. Extend these existing files rather than creating a second application or environment contract.

## `defineEnv`: values for handlers

In `src/platform/env.ts`:

```ts
import { defineEnv, env } from "@relkit/app/config";

export default defineEnv({
  LOG_LEVEL: env.literal("debug", "info", "warn", "error").default("info"),
  DATABASE_PATH: env.string().default(".relkit/app.sqlite"),
  BETTER_AUTH_SECRET: env.secret().requiredIn("production"),
  PUBLIC_ORIGIN: env.url().optional(),
});
```

Builders include `string`, `secret`, `number`, `boolean`, `port`, `url`, `json`, and `literal(...)`. Use `.default(value)` only for intentional safe defaults, `.optional()` for absent values, `.requiredIn("production")` for environment-specific requirements, and `.description(text)` or `.example(value)` for safe metadata. A URL field resolves to a `URL`, a number field to a number, and a Boolean field to a boolean. Do not declare `PORT` or `RELKIT_ENV`; RELKIT reserves them.

Pass the definition into `defineApp({ env })`. Functions read the resolved, typed values through `context.env`:

```ts
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  input: z.object({}),
  output: z.object({ level: z.string() }),
  handler: async (_input, context) => ({ level: context.env.LOG_LEVEL }),
});
```

Mark credentials with `env.secret()`; keep actual values outside source control. Secret metadata enables redaction in generated output, diagnostics, telemetry, and Inspector data. Avoid placeholder production secrets or logging resolved secrets.

## `defineApp`: topology and policy

In `relkit.config.ts`, the baseline application contains the environment contract, telemetry redaction, backend settings, and Inspector settings:

```ts
import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";

export default defineApp({
  env,
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
});
```

`defineApp` also accepts `id`, `defaults`, `deployment`, and provider capabilities `bucket`, `cache`, `jobs`, `event`, `model`, `realtime`, and `"agent-state"`. A capability can have one `default` profile or a named profile map. `defaults.<capability>` must name a configured profile. The `jobs` key is the public spelling for the job provider. Add only providers the app uses; the base template has none. Public creation currently certifies only the minimal starter with examples, no jobs, no cloud, and no deployment. API, agent, fullstack, jobs, and AWS/Pulumi creation tuples are internal candidates and must remain rejected until their exact release evidence is certified. Configure an existing app's optional integrations only when the installed version supports them and the task requires them.

For a one-machine realtime provider and a named Docker-backed cache profile, the complete configuration shape is:

```ts
import { defineApp, env as binding } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { localRealtime } from "@relkit/local";
import { redis } from "@relkit/redis";
import env from "@app/platform/env.js";

export default defineApp({
  env,
  cache: {
    requests: docker(redis({ url: binding.secret("REQUESTS_REDIS_URL") })),
  },
  realtime: localRealtime(),
  defaults: { cache: "requests", realtime: "default" },
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
});
```

Merge only the needed capabilities into the existing `defineApp`, preserving its other settings. Install the optional integration packages before importing them. `binding.secret("REQUESTS_REDIS_URL")` is a value-free provider binding; it is not a `context.env` field unless `defineEnv` declares that name too. Stable topology belongs in source; machine, stack, and secret values belong in environment bindings.

Platform fragments may explicitly export server, Inspector, telemetry, deployment, or provider settings and be imported by `relkit.config.ts`. Unimported files are not autoloaded. Keep provider acquisition in supported lazy factories and compose one `defineApp`.

CLI `--environment` selects provider configuration; `RELKIT_ENV` selects the application environment. `.env` and `.env.local` supply runtime values according to existing CLI loading; `.env.example` is informational and is not loaded as credentials.

## Inspect and verify environment values

From the generated project root:

```sh
bun run relkit env check
bun run relkit env list
bun run relkit env explain BETTER_AUTH_SECRET
bun run relkit env example
```

`check` validates active values, `list` shows presence/status without printing secrets, `explain` describes one declaration, and `example` renders a safe template. `env example --write --path .env.example` writes it when requested. Use `--environment <name>` with environment-aware CLI commands to select provider configuration; it does not define an application env field. Run `bun run check` and `bun run typecheck` after changing the contract, then exercise the affected runtime path. Run `bun run relkit local status` before using Docker-backed providers.

For observability settings, see [Observability and tracing](observability-apis.md); for realtime provider behavior, see [Realtime channels](realtime-apis.md).
