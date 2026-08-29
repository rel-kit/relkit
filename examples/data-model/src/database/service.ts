import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";
import usersModel from "./models/users.model.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => {
    const sqlite = new Database(env.DATABASE_PATH);
    sqlite.exec(
      "create table if not exists users (id integer primary key autoincrement, email text not null unique, active integer not null default 1)",
    );
    sqlite.exec(
      "create table if not exists memberships (id integer primary key autoincrement, organizationId text not null, userId integer not null, role text not null, unique (organizationId, userId))",
    );
    return drizzle({ client: sqlite });
  },
  models: { users: usersModel },
  overrides: {
    users: {
      findOne: async ({ args, base }) => {
        const user = await base(args);
        return user?.active === false ? null : user;
      },
    },
  },
  dispose: (database) => database.$client.close(),
});
