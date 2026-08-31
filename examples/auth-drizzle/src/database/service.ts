import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => {
    const sqlite = new Database(env.DATABASE_PATH);
    return drizzle({ client: sqlite });
  },
  dispose: (database) => database.$client.close(),
});
