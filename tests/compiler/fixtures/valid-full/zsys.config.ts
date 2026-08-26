import {
  aiSdk,
  defineConfig,
  defineEnv,
  env as envFactory,
  eventBridge,
  external,
  managed,
  redis,
  s3,
  sqs,
} from "@zsys/app";

const env = defineEnv({
  SERVICE_PORT: envFactory.port().default(3000),
  CACHE_URL: envFactory.secret().optional(),
  MODEL_API_KEY: envFactory.secret().optional(),
});

export default defineConfig({
  id: "full-app",
  env,
  buckets: {
    default: managed(
      s3({
        endpoint: "https://s3.us-east-1.amazonaws.com",
        bucketName: "assets",
        region: "us-east-1",
      }),
    ),
  },
  caches: { default: external(redis({ url: env.CACHE_URL })) },
  jobs: {
    default: managed(
      sqs({ region: "us-east-1", queueUrl: "https://sqs.us-east-1.amazonaws.com/1/jobs" }),
    ),
  },
  events: {
    default: managed(eventBridge({ region: "us-east-1", busName: "events" })),
  },
  models: {
    default: external(
      aiSdk({
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: env.MODEL_API_KEY },
      }),
    ),
  },
  defaults: {
    bucket: "default",
    cache: "default",
    job: "default",
    event: "default",
    model: "default",
  },
  telemetry: { bodyCapture: { mode: "off" } },
});
