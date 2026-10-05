import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, real, sqliteTable } from "drizzle-orm/sqlite-core";
import { activateDrizzleService } from "../../../packages/drizzle/src/activation.js";
import { defineDrizzleService } from "../../../packages/drizzle/src/service.js";

test("portable CRUD preserves large native SQLite REAL values", async () => {
  const samples = sqliteTable("samples", { id: integer().primaryKey(), value: real().notNull() });
  const sqlite = new Database(":memory:");
  sqlite.exec("create table samples (id integer primary key, value real not null)");
  const client = drizzle({ client: sqlite });
  const active = await activateDrizzleService(
    defineDrizzleService({
      schema: { samples },
      client: () => client,
      dispose: () => sqlite.close(),
    }),
    {},
    { isolated: true },
  );
  try {
    await client.insert(samples).values({ id: 1, value: 1e20 });
    expect(await active.context.samples.findMany()).toEqual([{ id: 1, value: 1e20 }]);
    expect(await active.context.samples.insert({ data: { id: 2, value: -1e100 } })).toEqual({
      id: 2,
      value: -1e100,
    });
    expect(
      await active.context.samples.update({ where: { id: 2 }, data: { value: 1e100 } }),
    ).toEqual({
      id: 2,
      value: 1e100,
    });
    await expect(
      active.context.samples.insert({ data: { id: 3, value: "invalid" } as never }),
    ).rejects.toThrow();
    expect(await active.context.samples.findOne({ where: { id: 3 } })).toBe(null);
  } finally {
    await active.close();
  }
});
