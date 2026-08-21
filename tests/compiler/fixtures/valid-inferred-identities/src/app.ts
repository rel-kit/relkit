import {
  awsProviders,
  defineApp,
  defineEnv,
  env as envFactory,
  localProviders,
  testProviders,
} from "@zsys/app";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });

export default defineApp({
  id: "inferred-app",
  env,
  providers: {
    development: localProviders(),
    test: testProviders(),
    production: awsProviders({ region: "us-east-1" }),
  },
});
