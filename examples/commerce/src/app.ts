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
      jobs: { default: { queueUrl: env.JOB_QUEUE_URL } },
      events: { default: { busName: env.EVENT_BUS_NAME } },
      modelProviders: {
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: env.OPENAI_API_KEY },
      },
    }),
  },
  observability: { bodyCapture: { mode: "off" } },
  defaults: { currency: "USD" },
});

export default app;
