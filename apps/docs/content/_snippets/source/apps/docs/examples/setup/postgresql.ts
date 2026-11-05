/** Validate the database connection before activating the Drizzle service. */
import { defineApp, defineEnv, env } from "relkit/config";

export default defineApp({
  env: defineEnv({ DATABASE_URL: env.secret() }),
});
