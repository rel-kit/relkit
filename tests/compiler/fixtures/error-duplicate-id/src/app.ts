import {
  awsProviders,
  defineApp,
  defineEnv,
  env as envFactory,
  localProviders,
  testProviders,
} from "@zsys/app";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });
const app = defineApp({
  id: "duplicate-app",
  env,
  providers: {
    development: localProviders(),
    test: testProviders(),
    production: awsProviders({ region: "us-east-1" }),
  },
});

export default app;
