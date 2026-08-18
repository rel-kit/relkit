import { awsProviders, defineApp, localProviders, testProviders } from "@zsys/app";
import env from "./env.js";

const app = defineApp({
  id: "commerce-api",
  env,
  providers: {
    development: localProviders({
      stateDirectory: ".zsys/state",
      observabilityDirectory: ".zsys/observability",
    }),
    test: testProviders({ deterministicIds: true, deterministicClock: true }),
    production: awsProviders({
      region: env.AWS_REGION,
      buckets: { default: { bucketName: env.ASSETS_BUCKET_NAME } },
      cache: { default: { endpoint: env.CACHE_ENDPOINT } },
      jobs: { default: { queuePrefix: "commerce" } },
      events: { default: { busName: "commerce-events" } },
      models: { default: { provider: "openai", apiKey: env.OPENAI_API_KEY } },
    }),
  },
  observability: { bodyCapture: { mode: "off" } },
  defaults: { currency: "USD" },
});

export default app;
