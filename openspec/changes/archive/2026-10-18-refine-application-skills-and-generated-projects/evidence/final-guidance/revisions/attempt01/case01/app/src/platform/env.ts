import { defineEnv, env } from "@relkit/app/config";

export default defineEnv({
  DATABASE_PATH: env.string().default(".relkit/app.sqlite"),
  BETTER_AUTH_SECRET: env.secret(),
  BETTER_AUTH_URL: env.string().default("http://127.0.0.1:3000"),
});
