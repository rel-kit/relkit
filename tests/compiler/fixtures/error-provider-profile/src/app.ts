import { awsProviders, defineApp, defineEnv, env, localProviders, testProviders } from "@zsys/app";

const application = defineApp({
  id: "provider-profile-app",
  env: defineEnv({ PORT: env.port().default(3000) }),
  providers: {
    development: localProviders(),
    test: testProviders({ deterministicIds: true, deterministicClock: true }),
    production: awsProviders({ region: "us-east-1" }),
  },
});

export default application;
