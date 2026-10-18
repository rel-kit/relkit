import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => {
    const path = env.DATABASE_PATH;
    if (!path) throw new Error("DATABASE_PATH is required");
    mkdirSync(dirname(path), { recursive: true });
    const sqlite = new Database(path);
    return drizzle({ client: sqlite });
  },
  dispose: (database) => database.$client.close(),
});
