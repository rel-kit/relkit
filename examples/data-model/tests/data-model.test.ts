import { expect, test } from "bun:test";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { Database } from "bun:sqlite";
import { invokeFunction } from "@relkit/testing";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import database from "@app/database/service.js";
import * as schema from "@app/database/schema/index.js";
import usersModel from "@app/database/models/users.model.js";
import registerMember from "@app/users/functions/register-member.function.js";
import updateUserEmail from "@app/users/functions/update-user-email.function.js";

test("runs CRUD, custom methods, composite selectors, schemas, and rollback", async () => {
  const active = await activateDrizzleService(database, { DATABASE_PATH: ":memory:" });
  const context = active.context;
  try {
    expect(
      migrate(active.client, { migrationsFolder: resolve(import.meta.dir, "../drizzle") }),
    ).toBeUndefined();
    const user = await context.users.insert({ data: { email: "one@example.com" } });
    expect(context.zodSchemas.users.select.parse(user)).toEqual(user);
    expect(await context.users.byEmailDomain("example.com")).toEqual([user]);
    expect(
      await context.users.findOneAndUpdate({ where: { id: user.id }, data: { active: false } }),
    ).toMatchObject({ active: false });
    expect(await context.users.findOne({ where: { id: user.id } })).toBeNull();
    expect(await context.users.findMany({ where: { active: false }, limit: 10 })).toHaveLength(1);

    const second = await context.users.upsert({
      where: { email: "two@example.com" },
      create: { email: "two@example.com" },
      update: { active: true },
    });
    expect(
      await context.users.upsert({
        where: { email: second.email },
        create: { email: second.email },
        update: { active: false },
      }),
    ).toMatchObject({ id: second.id, active: false });
    expect(
      await context.users.update({ where: { id: second.id }, data: { active: true } }),
    ).toMatchObject({ active: true });
    expect(
      await context.users.findMany({
        where: { active: true },
        orderBy: { field: "id", direction: "asc" },
        limit: 10,
        offset: 0,
      }),
    ).toHaveLength(1);
    expect(await context.users.delete({ where: { id: second.id } })).toMatchObject({
      id: second.id,
    });
    expect(await context.users.findOne({ where: { id: second.id } })).toBeNull();

    await context.memberships.insert({
      data: { organizationId: "org", userId: user.id, role: "owner" },
    });
    expect(
      await context.memberships.findOne({ where: { organizationId: "org", userId: user.id } }),
    ).toMatchObject({ role: "owner" });
    await expect(context.memberships.findOne({ where: { organizationId: "org" } })).rejects.toThrow(
      "complete primary or unique constraint",
    );

    expect(() => context.zodSchemas.users.insert.parse({ email: 123 })).toThrow();
    await expect(context.users.findMany({ limit: 1_001 })).rejects.toThrow("limit is invalid");
    await expect(
      context.transaction(async (tx) => {
        await tx.users.insert({ data: { email: "rollback@example.com" } });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await context.users.findMany({ where: { email: "rollback@example.com" } })).toEqual([]);
    await expect(context.transaction((tx) => tx.transaction(() => undefined))).rejects.toThrow(
      "Nested portable transactions are not supported",
    );
    expect(context.zodSchemas.users.insert.parse({ email: "new@example.com" })).toEqual({
      email: "new@example.com",
    });
    expect(context.zodSchemas.users.update.parse({ email: "new@example.com" })).toEqual({
      email: "new@example.com",
    });
    expect(context.zodSchemas.users.update.safeParse({}).success).toBe(true);
    expect(context.zodSchemas.users.select.safeParse({ email: "new@example.com" }).success).toBe(
      false,
    );
    expect(context.zodSchemas.users.insert.safeParse({ email: "not-an-email" }).success).toBe(true);

    const options = {
      context: ({ signal }: { signal: AbortSignal }) => ({ signal, database: context }),
    };
    const member = await invokeFunction(
      registerMember,
      { email: "member@example.com", organizationId: "org" },
      options,
    );
    expect(
      await context.memberships.findOne({
        where: { organizationId: "org", userId: member.userId },
      }),
    ).toMatchObject({ id: member.membershipId, role: "member" });
    expect(
      await invokeFunction(
        updateUserEmail,
        { userId: member.userId, email: "changed@example.com" },
        options,
      ),
    ).toEqual({ userId: member.userId, email: "changed@example.com" });
    expect(
      await invokeFunction(
        updateUserEmail,
        { userId: 999_999, email: "missing@example.com" },
        options,
      ),
    ).toBeNull();
    await expect(
      invokeFunction(registerMember, { email: "not-an-email", organizationId: "org" }, options),
    ).rejects.toThrow();
  } finally {
    await active.close();
  }
});

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
