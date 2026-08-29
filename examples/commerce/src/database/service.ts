import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => {
    const sqlite = new Database(env.DATABASE_PATH, { create: true });
    sqlite.exec(
      "create table if not exists users (id integer primary key autoincrement, email text not null unique)",
    );
    return drizzle({ client: sqlite });
  },
  dispose: (database) => database.$client.close(),
});
