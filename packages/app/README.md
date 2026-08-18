# @zsys/app

`@zsys/app` is the small public entry point for value-free application and
provider declarations. Concrete providers are selected once; descriptors keep
logical profiles and stable metadata.

```ts
import { awsProviders, defineApp, defineEnv, env, localProviders, testProviders } from "@zsys/app";

const environment = defineEnv({
  PORT: env.port().default(3000),
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
