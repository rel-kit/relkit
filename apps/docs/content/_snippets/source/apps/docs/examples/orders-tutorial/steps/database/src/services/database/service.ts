/** Lazily opens the configured SQLite database, registers tutorial tables and closes its owned client on disposal. */
import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => drizzle({ client: new Database(env.DATABASE_PATH) }),
  dispose: (database) => database.$client.close(),
});
