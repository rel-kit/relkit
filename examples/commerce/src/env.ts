import { defineEnv, env as envFactory } from "@relkit/app";

const env = defineEnv({
  APP_ENV: envFactory.literal("development", "test", "production").default("development"),
  BUCKET_ENDPOINT: envFactory.url().default(new URL("http://127.0.0.1:9000")),
  BUCKET_NAME: envFactory.string().default("commerce-assets"),
  BUCKET_REGION: envFactory.string().default("us-east-1"),
  BUCKET_ACCESS_KEY_ID: envFactory.secret().optional(),
  BUCKET_SECRET_ACCESS_KEY: envFactory.secret().optional(),
  BUCKET_FORCE_PATH_STYLE: envFactory.boolean().default(true),
  CACHE_URL: envFactory.secret().default("redis://127.0.0.1:6379"),
  JOB_REGION: envFactory.string().default("us-east-1"),
  JOB_ENDPOINT: envFactory.url().default(new URL("http://127.0.0.1:4566")),
  JOB_QUEUE_URL: envFactory.url().default(new URL("http://127.0.0.1:4566/000000000000/receipts")),
  EVENT_REGION: envFactory.string().default("us-east-1"),
  EVENT_ENDPOINT: envFactory.url().default(new URL("http://127.0.0.1:4566")),
  EVENT_BUS_NAME: envFactory.string().default("commerce-events"),
  OPENAI_API_KEY: envFactory.secret().requiredIn("production"),
  OBSERVABILITY_REGION: envFactory.string().default("us-east-1"),
  DATABASE_PATH: envFactory.string().default(".relkit/commerce.sqlite"),
  BETTER_AUTH_SECRET: envFactory.secret().default("development-only-auth-secret-32-characters"),
});

export default env;
