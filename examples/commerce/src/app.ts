import {
  aiSdk,
  cloudWatch,
  defineApp,
  eventBridge,
  external,
  managed,
  redis,
  s3,
  sqs,
} from "@zsys/app";
import env from "./env.js";

const app = defineApp({
  id: "commerce-api",
  env,
  providers: {
    buckets: {
      default: managed(
        s3({
          endpoint: env.BUCKET_ENDPOINT,
          bucketName: env.BUCKET_NAME,
          region: env.BUCKET_REGION,
          credentials: {
            accessKeyId: env.BUCKET_ACCESS_KEY_ID,
            secretAccessKey: env.BUCKET_SECRET_ACCESS_KEY,
          },
          forcePathStyle: env.BUCKET_FORCE_PATH_STYLE,
        }),
      ),
    },
    cache: { default: managed(redis({ url: env.CACHE_URL })) },
    jobs: {
      default: managed(
        sqs({
          region: env.JOB_REGION,
          endpoint: env.JOB_ENDPOINT,
          queueUrl: env.JOB_QUEUE_URL,
        }),
      ),
    },
    events: {
      default: managed(
        eventBridge({
          region: env.EVENT_REGION,
          endpoint: env.EVENT_ENDPOINT,
          busName: env.EVENT_BUS_NAME,
        }),
      ),
    },
    models: {
      default: external(
        aiSdk({
          defaultProvider: "openai",
          defaultModel: "gpt-5-mini",
          openai: { apiKey: env.OPENAI_API_KEY },
        }),
      ),
    },
    observability: {
      default: managed(cloudWatch({ region: env.OBSERVABILITY_REGION })),
    },
  },
  observability: { bodyCapture: { mode: "off" } },
  defaults: { currency: "USD" },
});

export default app;
