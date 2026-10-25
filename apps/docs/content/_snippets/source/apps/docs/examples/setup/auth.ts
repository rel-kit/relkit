/** Auth and Drizzle share one database; credentials remain in the backend environment. */
import { defineApp, defineEnv, env } from "@relkit/app/config";

export default defineApp({
  env: defineEnv({
    DATABASE_URL: env.secret(),
    BETTER_AUTH_URL: env.url(),
    BETTER_AUTH_SECRET: env.secret(),
  }),
});
