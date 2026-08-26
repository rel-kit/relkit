import { defineConfig, defineEnv, env } from "@zsys/app";

export default defineConfig({
  env: defineEnv({ DATABASE_PATH: env.string().default(":memory:") }),
  server: { port: 3000 },
  inspector: { port: 3210 },
});
