import { Database } from "bun:sqlite";
import { defineDataModel, type UpdateArgs } from "@zsys/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { like } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    organizationId: text().notNull(),
    userId: integer().notNull(),
    role: text().notNull(),
  },
  (table) => [uniqueIndex("membership_identity").on(table.organizationId, table.userId)],
);

export const sqlite = new Database(process.env.DATABASE_PATH ?? ":memory:");
export const database = drizzle({ client: sqlite });

const base = defineDataModel(
  database,
  { users, memberships },
  {
    users: {
      findOne: async ({ args, base: findOne }) => {
        const user = await findOne(args);
        return user?.active === false ? null : user;
      },
    },
  },
);

export type UsersFindOneAndUpdateArgs = UpdateArgs<typeof users>;

class UsersModel extends base.users {
  constructor() {
    super();
  }

  async findOneAndUpdate(args: UsersFindOneAndUpdateArgs) {
    if (!(await this.findOne({ where: args.where }))) return null;
    return this.update(args);
  }

  byEmailDomain(domain: string) {
    return this.drizzle
      .select()
      .from(this.table)
      .where(like(this.table.email, `%@${domain}`));
  }
}

export function initializeDataModel(): void {
  sqlite.exec(
    "create table if not exists users (id integer primary key autoincrement, email text not null unique, active integer not null default 1)",
  );
  sqlite.exec(
    "create table if not exists memberships (id integer primary key autoincrement, organizationId text not null, userId integer not null, role text not null, unique (organizationId, userId))",
  );
}

initializeDataModel();

export default base.custom("users", UsersModel);
