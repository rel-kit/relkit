import { it } from "@effect/vitest";
import { expect, expectTypeOf } from "vitest";
import { Effect } from "effect";
import { int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { integer as pgInteger, pgTable, text as pgText } from "drizzle-orm/pg-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { activateDrizzleService } from "../../src/activation.js";
import { defineDrizzleService } from "../../src/service.js";
import { defineModel } from "../../src/model.js";
import { noInstrumentation } from "./fixtures.js";
import { memoryClient } from "./crud-fixtures.js";

const mysqlUsers = mysqlTable("users", {
  id: int().primaryKey(),
  name: varchar({ length: 20 }).notNull(),
});
const pgUsers = pgTable("users", { id: pgInteger().primaryKey(), name: pgText().notNull() });

for (const [dialect, users, returning] of [
  ["mysql", mysqlUsers, false],
  ["pg", pgUsers, true],
] as const) {
  it.effect(`${dialect} keeps dialect write/row recovery and override base behavior`, () =>
    Effect.gen(function* () {
      const client = memoryClient(returning);
      const descriptor = defineDrizzleService({
        schema: { users },
        client: () => client,
        overrides: {
          users: {
            insert: ({ args, base }) => base({ data: { ...args.data, name: "overridden" } }),
          },
        },
      });
      const active = yield* Effect.promise(() =>
        activateDrizzleService(
          descriptor,
          {},
          { isolated: true, instrumentation: noInstrumentation },
        ),
      );
      expect(
        yield* Effect.promise(() =>
          active.context.users.insert({ data: { id: 1, name: "original" } }),
        ),
      ).toEqual({ id: 1, name: "overridden" });
      expect(
        yield* Effect.promise(() =>
          active.context.users.update({ where: { id: 1 }, data: { name: "updated" } }),
        ),
      ).toEqual({ id: 1, name: "updated" });
      expect(
        yield* Effect.promise(() =>
          active.context.users.upsert({
            where: { id: 1 },
            create: { id: 1, name: "unused" },
            update: { name: "upserted" },
          }),
        ),
      ).toEqual({ id: 1, name: "upserted" });
      expect(
        yield* Effect.promise(() => active.context.users.delete({ where: { id: 1 } })),
      ).toEqual({ id: 1, name: "upserted" });
      expect(yield* Effect.promise(() => active.context.users.findMany())).toEqual([]);
      expect(client.state().writes).toBe(4);
      expect(client.state().transactions).toBe(dialect === "mysql" ? 4 : 0);
      yield* Effect.promise(() => active.close());
    }),
  );
}

it.effect("sync and async extension inference retains injected transaction clients", () =>
  Effect.gen(function* () {
    const users = sqliteTable("users", { id: integer().primaryKey(), name: text().notNull() });
    const injected: unknown[] = [];
    const model = defineModel({
      table: users,
      extend: {
        sync: ({ database }, value: number) => {
          injected.push(database);
          return value;
        },
        async: async ({ database }, value: string) => {
          injected.push(database);
          return value;
        },
      },
    });
    const client = { run: () => undefined };
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({ schema: { users }, models: { users: model }, client: () => client }),
        {},
      ),
    );
    expectTypeOf(active.context.users.sync).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(active.context.users.sync).returns.toEqualTypeOf<number>();
    expectTypeOf(active.context.users.async).returns.toEqualTypeOf<Promise<string>>();
    expect(yield* Effect.promise(async () => active.context.users.sync(42))).toBe(42);
    expect(yield* Effect.promise(() => active.context.users.async("value"))).toBe("value");
    expect(
      yield* Effect.promise(() =>
        active.context.transaction((context) => context.users.async("transaction")),
      ),
    ).toBe("transaction");
    expect(injected).toEqual([client, client, client]);
    yield* Effect.promise(() => active.close());
  }),
);

it.effect(
  "malformed persisted rows and write arguments fail before or after SDK boundaries truthfully",
  () =>
    Effect.gen(function* () {
      const client = memoryClient(true);
      const descriptor = defineDrizzleService({ schema: { users: pgUsers }, client: () => client });
      const active = yield* Effect.promise(() => activateDrizzleService(descriptor, {}));
      const invalid = yield* Effect.promise(() =>
        active.context.users
          .insert({ data: { id: 1, name: null } as never })
          .catch((error: unknown) => error),
      );
      expect(invalid).toBeInstanceOf(Error);
      expect(client.state().writes).toBe(0);
      const invalidSelector = yield* Effect.promise(() =>
        active.context.users.findOne({ where: {} }).catch((error: unknown) => error),
      );
      expect(invalidSelector).toBeInstanceOf(TypeError);
      const invalidPage = yield* Effect.promise(() =>
        active.context.users.findMany({ limit: 1001 }).catch((error: unknown) => error),
      );
      expect(invalidPage).toBeInstanceOf(TypeError);
      yield* Effect.promise(() =>
        Promise.resolve(client.insert().values({ id: "wrong", name: "secret" })),
      );
      const malformed = yield* Effect.promise(() =>
        active.context.users.findMany().catch((error: unknown) => error),
      );
      expect(malformed).toBeInstanceOf(Error);
      yield* Effect.promise(() => active.close());
    }),
);
