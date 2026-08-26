import { expect, test } from "bun:test";
import { createDatabaseContext } from "@zsys/drizzle";
import model, { initializeDataModel, sqlite } from "../src/data/application.data-model.js";

test("runs CRUD, custom methods, composite selectors, schemas, and rollback", async () => {
  initializeDataModel();
  const context = createDatabaseContext(model);
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
  sqlite.exec("delete from memberships; delete from users;");
});
