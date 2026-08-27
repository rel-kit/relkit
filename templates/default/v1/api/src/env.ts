import { defineEnv, env } from "@relkit/config";

export default defineEnv({
  LOG_LEVEL: env.literal("trace", "debug", "info", "warn", "error").default("info"),
  EVENT_REGION: env.string().default("us-east-1"),
  EVENT_ENDPOINT: env.url().requiredIn("development", "production"),
  EVENT_BUS_NAME: env.string().requiredIn("development", "production"),
});
