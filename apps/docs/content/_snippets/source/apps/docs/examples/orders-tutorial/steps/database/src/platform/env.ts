import { defineEnv, env } from "@relkit/app/config";

export default defineEnv({
  LOG_LEVEL: env.literal("trace", "debug", "info", "warn", "error").default("info"),
  DATABASE_PATH: env.string().default("./orders.sqlite"),
});
