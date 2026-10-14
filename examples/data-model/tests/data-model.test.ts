/** Verifies grouped Drizzle CRUD, native models, transactions, schema validation and disposal. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { Database } from "bun:sqlite";
import { invokeFunction } from "@relkit/testing";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import database from "@app/services/database/service.js";
import * as schema from "@app/services/database/schema/index.js";
import usersModel from "@app/services/database/models/users.model.js";
import registerMember from "@app/services/users/functions/register-member.function.js";
import { verifyDataModelCrud, verifyCompositeSelectors } from "./data-model-crud.js";
import { verifyDataModelContracts, verifyDataModelFunctions } from "./data-model-contracts.js";

test("runs CRUD, custom methods, composite selectors, schemas, and rollback", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const active = yield* Effect.acquireRelease(
          Effect.tryPromise(() =>
            activateDrizzleService(database, { DATABASE_PATH: ":memory:" }, { isolated: true }),
          ),
          (owner) => Effect.promise(() => owner.close()),
        );
        expect(
          migrate(active.client, { migrationsFolder: resolve(import.meta.dir, "../drizzle") }),
        ).toBeUndefined();
        const user = yield* verifyDataModelCrud(active.context);
        yield* verifyCompositeSelectors(active.context, user);
        yield* verifyDataModelContracts(active.context);
        yield* verifyDataModelFunctions(active.context);
      }),
    ),
  ));

test("rolls back member registration if membership persistence fails", async () => {
  let membershipWritten = false;
  const service = defineDrizzleService({
    schema,
    client: () => drizzle({ client: new Database(":memory:") }),
    models: { users: usersModel },
    overrides: {
      memberships: {
        insert: async ({ args, base }) => {
          await base(args);
          membershipWritten = true;
          throw new Error("membership persistence failed");
        },
      },
    },
    dispose: (client) => client.$client.close(),
  });
  const active = await activateDrizzleService(service, { DATABASE_PATH: ":memory:" });
  try {
    expect(
      migrate(active.client, { migrationsFolder: resolve(import.meta.dir, "../drizzle") }),
    ).toBeUndefined();
    await expect(
      invokeFunction(
        registerMember,
        { email: "failed@example.com", organizationId: "org" },
        {
          context: ({ signal }) => ({ signal, database: active.context }),
        },
      ),
    ).rejects.toThrow();
    expect(membershipWritten).toBe(true);
    expect(await active.context.users.findMany()).toEqual([]);
    expect(await active.context.memberships.findMany()).toEqual([]);
  } finally {
    await active.close();
  }
});
