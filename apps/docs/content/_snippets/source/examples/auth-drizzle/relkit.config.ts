/** Declares auth/database environment requirements without selecting inspection. */
import { defineApp, defineEnv, env } from "relkit/config";

export default defineApp({
  env: defineEnv({
    DATABASE_PATH: env.string().default("./auth.sqlite"),
    BETTER_AUTH_SECRET: env.secret(),
    BETTER_AUTH_URL: env.url(),
  }),
  server: { port: 3000 },
});
