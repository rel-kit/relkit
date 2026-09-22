import { defineEnv, env } from "@relkit/app/config";

export default defineEnv({
  LOG_LEVEL: env.literal("trace", "debug", "info", "warn", "error").default("info"),
  DATABASE_PATH: env.string().default("./orders.sqlite"),
  BETTER_AUTH_SECRET: env.secret(),
  BETTER_AUTH_URL: env.url().default(new URL("http://127.0.0.1:3000")),
});
