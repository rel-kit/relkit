/** Owns lazy SQLite registration and disposal, supplying users-model extensions and an inactive-user lookup override. */
import { defineDrizzleService } from "@relkit/drizzle";
import { openSqliteDatabase } from "@relkit/drizzle/sqlite";
import * as schema from "./schema/index.js";
import usersModel from "./models/users.model.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => openSqliteDatabase(env.DATABASE_PATH),
  models: { users: usersModel },
  // #region user-overrides
  overrides: {
    users: {
      findOne: async ({ args, base }) => {
        const user = await base(args);
        return user?.active === false ? null : user;
      },
    },
  },
  // #endregion user-overrides
  dispose: (database) => database.$client.close(),
});
