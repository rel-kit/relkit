# @zsys/app

`@zsys/app` is the small public entry point for value-free application and
provider declarations. Concrete providers are selected once; descriptors keep
logical profiles and stable metadata.

```ts
import { awsProviders, defineApp, defineEnv, env, localProviders, testProviders } from "@zsys/app";

const environment = defineEnv({
  REGION: env.string().requiredIn("production"),
});

export default defineApp({
  id: "orders-app",
  env: environment,
  providers: {
    development: localProviders(),
    test: testProviders({ deterministicIds: true, deterministicClock: true }),
    production: awsProviders({ region: environment.REGION }),
  },
});
```

Importing this module creates metadata only. Runtime environment resolution and
provider construction happen during generation startup.

Application configuration lives in `zsys.config.ts`. `PORT` is reserved by the
framework; select ports through CLI flags, environment variables, or typed
configuration instead:

```ts
import { defineConfig } from "@zsys/app/config";

export default defineConfig({
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
});
```

Source discovery is fixed to `src/**/*.ts`, the application entry is
`src/app.ts`, and generated files live in `.zsys/generated`.
