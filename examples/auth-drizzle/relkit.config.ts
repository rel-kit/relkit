import { defineConfig, defineEnv, env } from "@relkit/app/config";

export default defineConfig({
  env: defineEnv({
    DATABASE_PATH: env.string().default(":memory:"),
    BETTER_AUTH_SECRET: env.secret().default("development-only-auth-secret-32-characters"),
  }),
  server: { port: 3000 },
  inspector: { port: 3210 },
});
