import { defineConfig, defineEnv, env } from "@relkit/app/config";

export default defineConfig({
  env: defineEnv({
    DATABASE_PATH: env.string().default("./auth.sqlite"),
    BETTER_AUTH_SECRET: env.secret(),
    BETTER_AUTH_URL: env.url().default(new URL("http://127.0.0.1:3000")),
  }),
  server: { port: 3000 },
  inspector: { port: 3210 },
});
