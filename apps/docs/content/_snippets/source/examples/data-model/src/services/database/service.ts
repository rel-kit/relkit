/** Owns lazy SQLite registration and disposal, supplying users-model extensions and an inactive-user lookup override. */
import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";
import usersModel from "./models/users.model.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => drizzle({ client: new Database(env.DATABASE_PATH) }),
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
