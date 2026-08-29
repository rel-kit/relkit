import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  activateDrizzleService,
  defineDrizzleService,
  defineModel,
} from "../../../packages/drizzle/src/index.js";
import { drizzle } from "../../../packages/drizzle/node_modules/drizzle-orm/bun-sqlite/index.js";
import { eq } from "../../../packages/drizzle/node_modules/drizzle-orm/index.js";
import {
  integer,
  sqliteTable,
  text,
} from "../../../packages/drizzle/node_modules/drizzle-orm/sqlite-core/index.js";

const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

const userModel = defineModel({
  table: users,
  extend: {
    byEmail: ({ table, database }, email: string) =>
      database.select().from(table).where(eq(table.email, email)),
  },
});

describe("Drizzle service", () => {
  test("activates once, binds models and transactions, and disposes once", async () => {
    let activations = 0;
    let disposals = 0;
    const service = defineDrizzleService({
      schema: { users },
      client: async () => {
        activations++;
        const sqlite = new Database(":memory:");
        sqlite.run(
          "create table users (id integer primary key autoincrement, email text not null unique, active integer not null default 1)",
        );
        return drizzle({ client: sqlite });
      },
      models: { users: userModel },
      overrides: {
        users: {
          findOne: async ({ args, base }) => {
            const user = await base(args);
            return user?.active === false ? null : user;
          },
        },
      },
      dispose: (database) => {
        disposals++;
        database.$client.close();
      },
    });

    const [first, second] = await Promise.all([
      activateDrizzleService(service, {}),
      activateDrizzleService(service, {}),
    ]);
    expect(first).toBe(second);
    expect(activations).toBe(1);
    const inserted = await first.context.users.insert({ data: { email: "one@example.com" } });
    expect(await first.context.users.byEmail("one@example.com")).toEqual([inserted]);
    await first.context.users.update({ where: { id: inserted.id }, data: { active: false } });
    expect(await first.context.users.findOne({ where: { id: inserted.id } })).toBeNull();

    await expect(
      first.context.transaction(async (transaction) => {
        await transaction.users.insert({ data: { email: "rollback@example.com" } });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      await first.context.users.findMany({ where: { email: "rollback@example.com" } }),
    ).toEqual([]);

    await first.close();
    await first.close();
    expect(disposals).toBe(1);
  });

  test("validates schema models and reserved extensions", () => {
    expect(() =>
      defineModel({ table: users, extend: { findOne: (() => undefined) as never } }),
    ).toThrow("reserved operation");
    const other = sqliteTable("other", { id: integer().primaryKey() });
    expect(() =>
      defineDrizzleService({
        schema: { users },
        client: () => ({}),
        models: { users: defineModel({ table: other, extend: { custom: () => undefined } }) },
      } as never),
    ).toThrow("matching schema table");
  });
});
