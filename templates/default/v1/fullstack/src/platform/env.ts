import { defineEnv, env } from "@relkit/app/config";

export default defineEnv({
  APP_ENV: env.literal("development", "test", "production").default("development"),
});
