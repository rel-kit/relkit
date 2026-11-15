/** Environment of the fixture application. */
import { defineEnv, env } from "relkit/config";

export default defineEnv({
  LOG_LEVEL: env.literal("debug", "info", "warn").default("info"),
  DATABASE_PATH: env.string().default(".relkit/fixture.sqlite"),
  AUTH_SECRET: env.secret(),
});
