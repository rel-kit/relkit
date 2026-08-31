import { defineConfig } from "drizzle-kit";

const path = process.env.DATABASE_PATH;
if (path === undefined || path.trim() === "" || path === ":memory:") {
  throw new Error("Set DATABASE_PATH to the persistent SQLite file you intend to migrate");
}

export default defineConfig({
  schema: "./src/database/schema/index.ts",
  dialect: "sqlite",
  out: "./drizzle",
  dbCredentials: { url: path },
});
