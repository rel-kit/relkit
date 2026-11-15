/** Declares the database service boundary without acquiring native clients. */
import { sql } from "drizzle-orm";
import { defineDrizzleService } from "@relkit/drizzle";
import { openSqliteDatabase } from "@relkit/drizzle/sqlite";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: async ({ env }) => {
    const database = await openSqliteDatabase(env.DATABASE_PATH);
    await database.run(
      sql`create table if not exists users (id integer primary key autoincrement, email text not null unique)`,
    );
    await database.run(
      sql`create table if not exists announcements (id integer primary key autoincrement, message text not null, created_at text not null)`,
    );
    return database;
  },
  dispose: (database) => database.$client.close(),
});
