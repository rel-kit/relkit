// SQLite conformance for one runtime: run by `bun` (bun:sqlite) and by `node` (node:sqlite).
// Plain JavaScript importing the built package, through RelKit's Drizzle service activation.
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { openSqliteDatabase } from "@relkit/drizzle/sqlite";
import { eq, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const runtime = typeof process.versions.bun === "string" ? "bun" : "node";
const root = await mkdtemp(join(tmpdir(), "relkit-sqlite-conformance-"));
const path = join(root, "nested", "app.db");
const items = sqliteTable("items", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  price: real().notNull(),
});
const service = defineDrizzleService({
  schema: { items },
  client: ({ env }) => openSqliteDatabase(env.DATABASE_PATH),
  dispose: (database) => database.$client.close(),
});

try {
  const first = await activateDrizzleService(service, { DATABASE_PATH: path });
  const database = first.client;
  await database.run(
    sql`create table items (id integer primary key autoincrement, name text not null, price real not null)`,
  );
  await database.insert(items).values([
    { name: "book", price: 12.5 },
    { name: "pen", price: 1.25 },
  ]);
  assert.deepEqual(await database.select().from(items).orderBy(items.id), [
    { id: 1, name: "book", price: 12.5 },
    { id: 2, name: "pen", price: 1.25 },
  ]);
  await database.update(items).set({ price: 2 }).where(eq(items.name, "pen"));
  database.$client.exec("BEGIN");
  await database.insert(items).values({ name: "rolled back", price: 0 });
  database.$client.exec("ROLLBACK");
  await database.delete(items).where(eq(items.name, "book"));
  await first.close();

  const reopened = await openSqliteDatabase(path);
  assert.deepEqual(await reopened.select().from(items), [{ id: 2, name: "pen", price: 2 }]);
  reopened.$client.close();

  const memory = await openSqliteDatabase(":memory:");
  assert.deepEqual(await memory.all(sql`select 1 + 1 as value`), [{ value: 2 }]);
  memory.$client.close();
  console.log(`SQLite conformance passed on ${runtime}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
