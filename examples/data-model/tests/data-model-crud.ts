/** Exercises real grouped Drizzle table operations and custom model overrides through public clients. */
import { expect } from "bun:test";
import { Effect } from "effect";
import type { DataModelContext, DataModelUser } from "./data-model.types.js";

/**
 * Checks table selectors, custom methods and upsert/update/delete behavior.
 * @param context - Caller-owned native database context.
 * @returns First user retained for composite selector assertions.
 */
export const verifyDataModelCrud = Effect.fn("test.dataModel.crud")(function* (
  context: DataModelContext,
) {
  const user = yield* Effect.tryPromise(() =>
    context.users.insert({ data: { email: "one@example.com" } }),
  );
  expect(context.zodSchemas.users.select.parse(user)).toEqual(user);
  expect(yield* Effect.tryPromise(() => context.users.byEmailDomain("example.com"))).toEqual([
    user,
  ]);
  expect(
    yield* Effect.tryPromise(() =>
      context.users.findOneAndUpdate({ where: { id: user.id }, data: { active: false } }),
    ),
  ).toMatchObject({ active: false });
  expect(
    yield* Effect.tryPromise(() => context.users.findOne({ where: { id: user.id } })),
  ).toBeNull();
  expect(
    yield* Effect.tryPromise(() => context.users.findMany({ where: { active: false }, limit: 10 })),
  ).toHaveLength(1);
  yield* verifyUserMutation(context);
  return user;
});

/**
 * Verifies native upsert identity, portable query ordering and deletion.
 * @param context - Caller-owned native database context.
 * @returns Completion after the second user's lifecycle has been checked.
 */
const verifyUserMutation = Effect.fn("test.dataModel.mutation")(function* (
  context: DataModelContext,
) {
  const second = yield* Effect.tryPromise(() =>
    context.users.upsert({
      where: { email: "two@example.com" },
      create: { email: "two@example.com" },
      update: { active: true },
    }),
  );
  expect(
    yield* Effect.tryPromise(() =>
      context.users.upsert({
        where: { email: second.email },
        create: { email: second.email },
        update: { active: false },
      }),
    ),
  ).toMatchObject({ id: second.id, active: false });
  expect(
    yield* Effect.tryPromise(() =>
      context.users.update({ where: { id: second.id }, data: { active: true } }),
    ),
  ).toMatchObject({ active: true });
  expect(
    yield* Effect.tryPromise(() =>
      context.users.findMany({
        where: { active: true },
        orderBy: { field: "id", direction: "asc" },
        limit: 10,
        offset: 0,
      }),
    ),
  ).toHaveLength(1);
  expect(
    yield* Effect.tryPromise(() => context.users.delete({ where: { id: second.id } })),
  ).toMatchObject({ id: second.id });
  expect(
    yield* Effect.tryPromise(() => context.users.findOne({ where: { id: second.id } })),
  ).toBeNull();
});

/**
 * Checks complete composite selectors and invalid portable-query arguments.
 * @param context - Caller-owned database context.
 * @param user - Native row whose membership is created by this assertion.
 * @returns Completion after valid and rejected selector assertions.
 */
export const verifyCompositeSelectors = Effect.fn("test.dataModel.selectors")(function* (
  context: DataModelContext,
  user: DataModelUser,
) {
  yield* Effect.tryPromise(() =>
    context.memberships.insert({ data: { organizationId: "org", userId: user.id, role: "owner" } }),
  );
  expect(
    yield* Effect.tryPromise(() =>
      context.memberships.findOne({ where: { organizationId: "org", userId: user.id } }),
    ),
  ).toMatchObject({ role: "owner" });
  yield* Effect.tryPromise(async () =>
    expect(context.memberships.findOne({ where: { organizationId: "org" } })).rejects.toThrow(
      "complete primary or unique constraint",
    ),
  );
  expect(() => context.zodSchemas.users.insert.parse({ email: 123 })).toThrow();
  yield* Effect.tryPromise(async () =>
    expect(context.users.findMany({ limit: 1_001 })).rejects.toThrow("limit is invalid"),
  );
});
