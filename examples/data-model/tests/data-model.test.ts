import { expect, test } from "bun:test";
import { activateDrizzleService } from "@relkit/drizzle";
import database from "@app/database/service.js";

test("runs CRUD, custom methods, composite selectors, schemas, and rollback", async () => {
  const active = await activateDrizzleService(database, { DATABASE_PATH: ":memory:" });
  const context = active.context;
  const user = await context.users.insert({ data: { email: "one@example.com" } });
  expect(context.zodSchemas.users.select.parse(user)).toEqual(user);
  expect(await context.users.byEmailDomain("example.com")).toEqual([user]);
  expect(
    await context.users.findOneAndUpdate({ where: { id: user.id }, data: { active: false } }),
  ).toMatchObject({ active: false });
  await context.memberships.insert({
    data: { organizationId: "org", userId: user.id, role: "owner" },
  });
  expect(
    await context.memberships.findOne({ where: { organizationId: "org", userId: user.id } }),
  ).toMatchObject({ role: "owner" });
  await expect(
    context.transaction(async (tx) => {
      await tx.users.insert({ data: { email: "rollback@example.com" } });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await context.users.findMany({ where: { email: "rollback@example.com" } })).toEqual([]);
  await active.close();
});
