// PostgreSQL or MySQL conformance for one runtime: run by `bun` (Bun SQL) and by `node` (`pg`,
// `mysql2`). Plain JavaScript importing the built package, through RelKit's Drizzle service
// activation. Reads DIALECT (`pg` or `mysql`) and DATABASE_URL; with CHECK_LOAD=1 it only loads
// the client and builds a query, without connecting.
import { strict as assert } from "node:assert";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { openMysqlDatabase } from "@relkit/drizzle/mysql";
import { openPostgresDatabase } from "@relkit/drizzle/pg";
import { eq, sql } from "drizzle-orm";
import { int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { pgTable, serial, text } from "drizzle-orm/pg-core";

const runtime = typeof process.versions.bun === "string" ? "bun" : "node";
const dialect = process.env.DIALECT;
const items =
  dialect === "pg"
    ? pgTable("items", { id: serial().primaryKey(), name: text().notNull() })
    : mysqlTable("items", {
        id: int().autoincrement().primaryKey(),
        name: varchar({ length: 255 }).notNull(),
      });
const open = dialect === "pg" ? openPostgresDatabase : openMysqlDatabase;

if (process.env.CHECK_LOAD === "1") {
  const database = await open(
    `${dialect === "pg" ? "postgres" : "mysql"}://relkit@127.0.0.1:1/never`,
  );
  assert.equal(typeof database.select, "function");
  assert.ok(database.select().from(items).toSQL().sql.includes("items"));
  await database.$client.end();
  console.log(`${dialect} client loaded on ${runtime}`);
} else {
  const service = defineDrizzleService({
    schema: { items },
    client: ({ env }) => open(env.DATABASE_URL),
    dispose: (database) => database.$client.end(),
  });
  const active = await activateDrizzleService(service, { DATABASE_URL: process.env.DATABASE_URL });
  const database = active.client;
  await database.execute(sql`create table items (id serial primary key, name text not null)`);
  await database.insert(items).values([{ name: "book" }, { name: "pen" }]);
  await database.update(items).set({ name: "pencil" }).where(eq(items.name, "pen"));
  assert.deepEqual(await database.select().from(items).orderBy(items.id), [
    { id: 1, name: "book" },
    { id: 2, name: "pencil" },
  ]);
  await active.close();
  console.log(`${dialect} conformance passed on ${runtime}`);
}
