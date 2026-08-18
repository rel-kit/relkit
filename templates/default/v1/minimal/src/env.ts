import { defineEnv, env } from "@zsys/config";

export default defineEnv({
  ZSYS_ENV: env.literal("development", "test", "production").default("development"),
  PORT: env.port().default(3000),
  LOG_LEVEL: env.literal("trace", "debug", "info", "warn", "error").default("info"),
  AWS_REGION: env.string().default("us-east-1"),
});
