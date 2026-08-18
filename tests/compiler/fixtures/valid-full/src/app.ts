import {
  awsProviders,
  defineApp,
  defineEnv,
  env as envFactory,
  localProviders,
  testProviders,
} from "@zsys/app";

const env = defineEnv({ PORT: envFactory.port().default(3000) });

const app = defineApp({
  id: "full-app",
  env,
  providers: {
    development: localProviders(),
    test: testProviders(),
    production: awsProviders({ region: "us-east-1" }),
  },
  defaults: { currency: "USD" },
  observability: { bodyCapture: { mode: "off" } },
});

export default app;
