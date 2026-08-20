# @zsys/config

`@zsys/config` declares typed environment rules and safe metadata. Declaration
modules are value-free: importing one creates builders and metadata but does
not read process, file, or runtime environment values.

## Declare environment rules

```ts
import { defineEnv, env } from "@zsys/config";

export default defineEnv({
  APP_MODE: env.literal("development", "test", "production").default("development"),
  WORKER_PORT: env.port().default(3210),
  API_URL: env.url().requiredIn("production"),
  API_TOKEN: env.secret().optional().description("Token for the external API"),
});
```

The declaration above records parsing rules, requirements, defaults, and
sensitivity. It does not resolve a value at module import time. Keep runtime
resolution in an explicit startup function with an explicit source:

```ts
import { projectEnv, resolveEnv } from "@zsys/config";
import definition from "./env";

export const environmentMetadata = projectEnv(definition);

export function resolveRuntimeEnv(
  source: Readonly<Record<string, string | undefined>>,
  environment: string,
) {
  return resolveEnv(definition, { environment, source });
}

export function start(source: Readonly<Record<string, string | undefined>>, environment: string) {
  return resolveRuntimeEnv(source, environment);
}
```

`projectEnv` is safe for graph and inspector metadata: it includes names,
types, requirements, default presence, and sensitivity without resolved values
or secret defaults. `resolveEnv` returns an immutable value object and reports
missing or malformed values with structured issues.

`PORT` is reserved for framework server selection and is rejected by
`defineEnv`; configure it with `server.port`, the `PORT` process variable, or
the CLI `--port` flag.
