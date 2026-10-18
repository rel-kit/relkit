import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/services/database/schema/index.ts",
  out: "./src/services/database/migrations",
  dbCredentials: { url: process.env.DATABASE_PATH ?? ".relkit/app.sqlite" },
});
