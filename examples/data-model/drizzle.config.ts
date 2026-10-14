/** Points native Drizzle tooling at grouped model tables and rejects empty or in-memory migration targets. */
import { defineConfig } from "drizzle-kit";

const path = process.env.DATABASE_PATH;
if (path === undefined || path.trim() === "" || path === ":memory:") {
  throw new Error("Set DATABASE_PATH to the persistent SQLite file you intend to migrate");
}

export default defineConfig({
  schema: "./src/services/database/schema/index.ts",
  dialect: "sqlite",
  out: "./drizzle",
  dbCredentials: { url: path },
});
