import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createDatabaseContext, defineDataModel } from "../../../packages/drizzle/src/index.js";
import { drizzle } from "../../../packages/drizzle/node_modules/drizzle-orm/bun-sqlite/index.js";
import { eq } from "../../../packages/drizzle/node_modules/drizzle-orm/index.js";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "../../../packages/drizzle/node_modules/drizzle-orm/sqlite-core/index.js";

const users = sqliteTable(
  "users",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    email: text().notNull(),
    active: integer({ mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("users_email").on(table.email)],
);

describe("Drizzle data model", () => {
  test("binds overrides, custom methods, schemas, and transactions per invocation", async () => {
    const sqlite = new Database(":memory:");
    sqlite.run(
      "create table users (id integer primary key autoincrement, email text not null unique, active integer not null default 1)",
    );
    const database = drizzle({ client: sqlite });
    const base = defineDataModel(
      database,
      { users },
      {
        users: {
          findOne: async ({ args, base: findOne }) => {
            const user = await findOne(args);
            return user?.active === false ? null : user;
          },
        },
      },
    );
    class UsersModel extends base.users {
      async byEmail(email: string) {
        return this.drizzle.select().from(this.table).where(eq(this.table.email, email));
      }
    }
    const model = base.custom("users", UsersModel);
    const context = createDatabaseContext(model);

    const inserted = await context.users.insert({ data: { email: "one@example.com" } });
    expect(await context.users.byEmail("one@example.com")).toEqual([inserted]);
    expect(context.zodSchemas.users.select.parse(inserted)).toEqual(inserted);
    await context.users.update({ where: { email: inserted.email }, data: { active: false } });
    expect(await context.users.findOne({ where: { id: inserted.id } })).toBeNull();

    await expect(
      context.transaction(async (transaction) => {
        await transaction.users.insert({ data: { email: "rollback@example.com" } });
        await expect(transaction.transaction(async () => undefined)).rejects.toThrow("Nested");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await context.users.findMany({ where: { email: "rollback@example.com" } })).toEqual([]);
    sqlite.close();
  });

  test("rejects incomplete selectors and custom base-operation replacements", async () => {
    const sqlite = new Database(":memory:");
    sqlite.run(
      "create table users (id integer primary key autoincrement, email text not null unique, active integer not null default 1)",
    );
    const model = defineDataModel(drizzle({ client: sqlite }), { users });
    const context = createDatabaseContext(model);
    await expect(context.users.findOne({ where: { active: true } })).rejects.toThrow(
      "unique constraint",
    );
    class Invalid extends model.users {
      findOne() {
        return Promise.resolve(null);
      }
    }
    expect(() => model.custom("users", Invalid)).toThrow("cannot replace");
    sqlite.close();
  });
});
