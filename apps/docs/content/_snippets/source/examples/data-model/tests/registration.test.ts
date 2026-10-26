/** Verifies the guide's registration commits both records or rolls both back. */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { invokeFunction } from "@relkit/testing";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "@app/services/database/schema/index.js";
import usersModel from "@app/services/database/models/users.model.js";
import registerMember from "@app/services/users/functions/register-member.function.js";

for (const failMembership of [false, true]) {
  test(
    failMembership ? "registration rolls back both records" : "registration saves both records",
    async () => {
      const definition = defineDrizzleService({
        schema,
        client: () => drizzle({ client: new Database(":memory:") }),
        models: { users: usersModel },
        overrides: {
          memberships: {
            insert: async ({ args, base }) => {
              const membership = await base(args);
              if (failMembership) throw new Error("membership unavailable");
              return membership;
            },
          },
        },
        dispose: (database) => database.$client.close(),
      });
      const handle = await activateDrizzleService(definition, {});
      try {
        migrate(handle.client, { migrationsFolder: "src/services/database/migrations" });
        const registration = invokeFunction(
          registerMember,
          {
            email: "member@example.com",
            organizationId: "bookshop",
          },
          { context: ({ signal }) => ({ signal, database: handle.context }) },
        );
        if (failMembership) {
          await expect(registration).rejects.toThrow();
          expect(await handle.context.users.findMany()).toEqual([]);
          expect(await handle.context.memberships.findMany()).toEqual([]);
        } else {
          const result = await registration;
          expect(
            await handle.context.users.findOne({ where: { id: result.userId } }),
          ).toMatchObject({ email: "member@example.com" });
          expect(
            await handle.context.memberships.findOne({ where: { id: result.membershipId } }),
          ).toMatchObject({ userId: result.userId, organizationId: "bookshop", role: "member" });
        }
      } finally {
        await handle.close();
      }
    },
  );
}
