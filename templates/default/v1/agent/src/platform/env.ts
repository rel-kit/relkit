import { defineEnv, env } from "@relkit/app/config";

export default defineEnv({
  LOG_LEVEL: env.literal("trace", "debug", "info", "warn", "error").default("info"),
  OPENAI_API_KEY: env.secret().requiredIn("production"),
  ANTHROPIC_API_KEY: env.secret().requiredIn("production"),
});
