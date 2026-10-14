/** Exercises real grouped transaction rollback, schema generation and validated business functions. */
import { expect } from "bun:test";
import { Effect } from "effect";
import { invokeFunction } from "@relkit/testing";
import registerMember from "@app/services/users/functions/register-member.function.js";
import updateUserEmail from "@app/services/users/functions/update-user-email.function.js";
import type { DataModelContext } from "./data-model.types.js";

/**
 * Checks rollback, rejected nesting and generated select/insert/update validation.
 * @param context - Caller-owned database context.
 * @returns Completion after native transaction and schema assertions.
 */
export const verifyDataModelContracts = Effect.fn("test.dataModel.contracts")(function* (
  context: DataModelContext,
) {
  yield* Effect.tryPromise(async () =>
    expect(
      context.transaction(async (tx) => {
        await tx.users.insert({ data: { email: "rollback@example.com" } });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback"),
  );
  expect(
    yield* Effect.tryPromise(() =>
      context.users.findMany({ where: { email: "rollback@example.com" } }),
    ),
  ).toEqual([]);
  yield* Effect.tryPromise(async () =>
    expect(context.transaction((tx) => tx.transaction(() => undefined))).rejects.toThrow(
      "Nested portable transactions are not supported",
    ),
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
});

/**
 * Runs domain operations using their validated database context and rejects invalid input.
 * @param context - Caller-owned database context.
 * @returns Completion after real registration/update and failure assertions.
 */
export const verifyDataModelFunctions = Effect.fn("test.dataModel.functions")(function* (
  context: DataModelContext,
) {
  const options = {
    context: ({ signal }: { readonly signal: AbortSignal }) => ({ signal, database: context }),
  };
  const member = yield* Effect.tryPromise(() =>
    invokeFunction(registerMember, { email: "member@example.com", organizationId: "org" }, options),
  );
  expect(
    yield* Effect.tryPromise(() =>
      context.memberships.findOne({ where: { organizationId: "org", userId: member.userId } }),
    ),
  ).toMatchObject({ id: member.membershipId, role: "member" });
  expect(
    yield* Effect.tryPromise(() =>
      invokeFunction(
        updateUserEmail,
        { userId: member.userId, email: "changed@example.com" },
        options,
      ),
    ),
  ).toEqual({ userId: member.userId, email: "changed@example.com" });
  expect(
    yield* Effect.tryPromise(() =>
      invokeFunction(updateUserEmail, { userId: 999_999, email: "missing@example.com" }, options),
    ),
  ).toBeNull();
  yield* Effect.tryPromise(async () =>
    expect(
      invokeFunction(registerMember, { email: "not-an-email", organizationId: "org" }, options),
    ).rejects.toThrow(),
  );
});
