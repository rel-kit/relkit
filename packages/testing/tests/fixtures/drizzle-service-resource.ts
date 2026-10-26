/** Actual SQLite resources for the database-only helper lifetime regression. */
import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { defineRoute } from "@relkit/routes";

export const clients: Database[] = [];
export const released: Database[] = [];
const records = sqliteTable("records", { id: integer().primaryKey() });
export const route = defineRoute({ handler: () => Response.json({ ok: true }) });
export const database = defineDrizzleService({
  schema: { records },
  client: () => {
    const client = new Database(":memory:");
    client.exec("create table records (id integer primary key); insert into records values (1)");
    clients.push(client);
    return drizzle({ client });
  },
  dispose: (active) => {
    released.push(active.$client);
    active.$client.close();
  },
});
