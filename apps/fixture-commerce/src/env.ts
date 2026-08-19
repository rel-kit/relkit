import { defineEnv, env as envFactory } from "@zsys/app";

const env = defineEnv({
  APP_ENV: envFactory.literal("development", "test", "production").default("development"),
  PORT: envFactory.port().default(3000),
  AWS_REGION: envFactory.string().default("us-east-1").requiredIn("production"),
  ASSETS_BUCKET_NAME: envFactory.string().requiredIn("production"),
  CACHE_ENDPOINT: envFactory.url().optional(),
  JOB_QUEUE_URL: envFactory.url().requiredIn("production"),
  EVENT_BUS_NAME: envFactory.string().requiredIn("production"),
  OPENAI_API_KEY: envFactory.secret().requiredIn("production"),
});

export default env;
