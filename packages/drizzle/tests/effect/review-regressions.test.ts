import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Context, Effect, Logger, Metric, References, Schema } from "effect";
import { bigint, pgTable } from "drizzle-orm/pg-core";
import { bigint as mysqlBigint, mysqlTable } from "drizzle-orm/mysql-core";
import { activateDrizzleService } from "../../src/activation.js";
import { defineDrizzleService, drizzleRuntimeOf } from "../../src/service.js";
import { operationEffect } from "../../src/operations.js";
import { makeDrizzleOwner } from "../../src/owner.js";
import { effectSchemasFor } from "../../src/table.schemas.js";
import { transactionEffect, withTransactionWork } from "../../src/transaction.js";
import type { DatabaseContext } from "../../src/types.js";
import { gate, records, sqliteClient } from "./fixtures.js";

it.effect("escaped override bases reacquire SQLite exclusion and reject closed owners", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    let queries = 0;
    const builder = {
      from() {
        return this;
      },
      limit() {
        return this;
      },
      offset() {
        queries++;
        return Promise.resolve([]);
      },
    };
    const entered = gate<void>();
    const release = gate<void>();
    let escaped: () => Promise<unknown> = () => Promise.reject(new Error("missing base"));
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => ({ ...client, select: () => builder }),
          overrides: {
            records: {
              findMany: ({ base }) => {
                escaped = () => base({});
                return [];
              },
            },
          },
        }),
        {},
        { isolated: true },
      ),
    );
    yield* Effect.promise(() => active.context.records.findMany());
    const parent = active.context.transaction(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    yield* Effect.promise(() => entered.promise);
    const pending = escaped();
    try {
      yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)));
      expect(queries).toBe(0);
    } finally {
      release.resolve(undefined);
      yield* Effect.promise(() => Promise.all([parent, pending]));
      yield* Effect.promise(() => active.close());
    }
    expect(queries).toBe(1);
    expect(
      yield* Effect.promise(() =>
        escaped().then(
          () => false,
          () => true,
        ),
      ),
    ).toBe(true);
    expect(queries).toBe(1);
  }),
);

it.effect("transaction contexts reject use after their callback lifetime", () =>
  Effect.gen(function* () {
    let queries = 0;
    const service = defineDrizzleService({
      schema: { records },
      client: () => sqliteClient(),
      overrides: {
        records: {
          findMany: () => {
            queries++;
            return [];
          },
        },
      },
    });
    const active = yield* Effect.promise(() =>
      activateDrizzleService(service, {}, { isolated: true }),
    );
    let escaped: DatabaseContext<typeof service> | undefined;
    yield* Effect.promise(() =>
      active.context.transaction((tx) => {
        escaped = tx;
      }),
    );
    try {
      const error = yield* Effect.promise(() =>
        escaped!.records.findMany().catch((cause: unknown) => cause),
      );
      expect(error).toBeInstanceOf(TypeError);
      expect(String(error)).toContain("transaction is closed");
      expect(queries).toBe(0);
      expect(yield* Effect.promise(() => active.context.records.findMany())).toEqual([]);
    } finally {
      yield* Effect.promise(() => active.close());
    }
  }),
);

for (const dialect of ["pg", "mysql"] as const) {
  it.effect(`${dialect} callback completion waits for detached transaction children`, () =>
    Effect.gen(function* () {
      const entered = gate<void>();
      const release = gate<void>();
      let committed = false;
      let child: Promise<unknown> | undefined;
      const client = {
        transaction: async (run: (database: unknown) => Promise<unknown>) => {
          const result = await run(client);
          committed = true;
          return result;
        },
      };
      // Exercise the same transaction wrapper used by native driver callbacks.
      const parent = Effect.runPromise(
        transactionEffect(client, dialect, async (_database, lease) => {
          child = Effect.runPromise(
            withTransactionWork(
              lease,
              Effect.promise(async () => {
                entered.resolve(undefined);
                await release.promise;
              }),
            ),
          );
          await entered.promise;
        }),
      );
      yield* Effect.promise(() => entered.promise);
      try {
        yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)));
        expect(committed).toBe(false);
      } finally {
        release.resolve(undefined);
        yield* Effect.promise(() => Promise.all([parent, child]));
      }
      expect(committed).toBe(true);
    }),
  );
}

it.effect("transaction children drain before commit and owner disposal", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const entered = gate<void>();
    const release = gate<void>();
    let disposed = false;
    let committed = false;
    let child: Promise<unknown> | undefined;
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => client,
          dispose: () => {
            disposed = true;
          },
          overrides: {
            records: {
              findMany: async () => {
                entered.resolve(undefined);
                await release.promise;
                return [];
              },
            },
          },
        }),
        {},
        { isolated: true },
      ),
    );
    const parent = active.context
      .transaction(async (tx) => {
        child = tx.records.findMany();
        await entered.promise;
      })
      .then(() => {
        committed = true;
      });
    yield* Effect.promise(() => entered.promise);
    const closing = active.close();
    try {
      yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)));
      expect(committed).toBe(false);
      expect(client.statements).toEqual(["begin"]);
      expect(disposed).toBe(false);
    } finally {
      release.resolve(undefined);
      yield* Effect.promise(() => Promise.allSettled([parent, child, closing]));
    }
    expect(committed).toBe(true);
    expect(disposed).toBe(true);
    expect(client.statements).toEqual(["begin", "commit"]);
  }),
);

for (const [dialect, table] of [
  ["pg", pgTable("string_ids", { id: bigint({ mode: "string" }).primaryKey() })],
  ["mysql", mysqlTable("string_ids", { id: mysqlBigint({ mode: "string" }).primaryKey() })],
] as const) {
  it.effect(
    `${dialect} string bigint schemas preserve native values and reject invalid integers`,
    () =>
      Effect.gen(function* () {
        const schemas = effectSchemasFor(table);
        for (const schema of [schemas.select, schemas.insert, schemas.update]) {
          expect(yield* Schema.decodeUnknownEffect(schema)({ id: "9007199254740993" })).toEqual({
            id: "9007199254740993",
          });
          for (const id of ["x", "1.5", "9223372036854775808", "-9223372036854775809", 1n]) {
            expect((yield* Effect.exit(Schema.decodeUnknownEffect(schema)({ id })))._tag).toBe(
              "Failure",
            );
          }
        }
      }),
  );
}

it.effect("standalone CRUD Effects emit logs and count one operation", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    const logs: unknown[] = [];
    const declaration = drizzleRuntimeOf(
      defineDrizzleService({
        schema: { records },
        client: () => ({}),
        overrides: { records: { findMany: () => [{ id: 1 }] } },
      }),
    );
    yield* Effect.gen(function* () {
      const owner = yield* makeDrizzleOwner({});
      expect(
        yield* owner.work(
          operationEffect(
            {
              drizzle: owner.client,
              table: records,
              dialect: "sqlite",
              inTransaction: false,
              metadata: declaration.metadata.records!,
              schemas: declaration.effectSchemas.records!,
              override: declaration.overrides.records!,
              run: (effect) => Effect.runPromise(effect),
            },
            "findMany",
            {},
          ),
        ),
      ).toEqual([{ id: 1 }]);
    }).pipe(
      Effect.provide(Logger.layer([Logger.make((options) => logs.push(options.message))])),
      Effect.provideService(References.MinimumLogLevel, "Info"),
      Effect.provideService(Metric.MetricRegistry, registry),
    );
    expect(logs).toHaveLength(1);
    const counters = [...registry.values()].filter(
      (metric) => metric.id === "relkit_execution_operations_total",
    );
    expect(counters).toHaveLength(1);
    expect(counters[0]!.hooks.get(Context.empty()).count).toBe(1);
  }),
);
