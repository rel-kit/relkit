import { defineConfig, defineEnv, env } from "@relkit/app";

export default defineConfig({
  env: defineEnv({ DATABASE_PATH: env.string().default(":memory:") }),
  server: { port: 3000 },
  inspector: { port: 3210 },
});
