import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { bigint, pgTable } from "drizzle-orm/pg-core";
import { Context, Effect, Logger, Metric, References, Schema } from "effect";
import { activateDrizzleService } from "../../../packages/drizzle/src/activation.js";
import { defineDrizzleService, drizzleRuntimeOf } from "../../../packages/drizzle/src/service.js";
import { defineModel } from "../../../packages/drizzle/src/model.js";
import { operationEffect } from "../../../packages/drizzle/src/operations.js";
import { owners } from "../../../packages/drizzle/src/owner.js";
import { effectSchemasFor } from "../../../packages/drizzle/src/table.schemas.js";
import { gate, records } from "../../../packages/drizzle/tests/effect/fixtures.js";

test("public transaction APIs drain a detached child before SQLite commit and close", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec("create table records (id integer primary key)");
  const entered = gate<void>();
  const release = gate<void>();
  let committed = false;
  let disposed = false;
  const model = defineModel({
    table: records,
    extend: {
      delayedInsert: async ({ database, table }) => {
        entered.resolve(undefined);
        await release.promise;
        return database.insert(table).values({ id: 1 }).returning();
      },
    },
  });
  const active = await activateDrizzleService(
    defineDrizzleService({
      schema: { records },
      models: { records: model },
      client: () => drizzle({ client: sqlite }),
      dispose: () => {
        disposed = true;
        sqlite.close();
      },
    }),
    {},
    { isolated: true },
  );
  let child: Promise<unknown> | undefined;
  const parent = active.context
    .transaction(async (tx) => {
      child = tx.records.delayedInsert();
      await entered.promise;
    })
    .then(() => {
      committed = true;
    });
  await entered.promise;
  const closing = active.close();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const before = { committed, disposed };
  release.resolve(undefined);
  const results = await Promise.allSettled([parent, child, closing]);
  console.log(JSON.stringify({ before, child: results[1]?.status, committed, disposed }));
  expect(before).toEqual({ committed: false, disposed: false });
  expect(results[1]).toMatchObject({ status: "fulfilled", value: [{ id: 1 }] });
  expect(committed && disposed).toBe(true);
});

test("installed PostgreSQL string bigint contracts accept native strings", async () => {
  const table = pgTable("string_ids", { id: bigint({ mode: "string" }).primaryKey() });
  const schemas = effectSchemasFor(table);
  const outcomes = await Promise.all(
    Object.values(schemas).map((schema) =>
      Effect.runPromiseExit(Schema.decodeUnknownEffect(schema)({ id: "9007199254740993" })),
    ),
  );
  console.log(JSON.stringify({ outcomes: outcomes.map((exit) => exit._tag) }));
  for (const exit of outcomes)
    expect(exit).toMatchObject({ _tag: "Success", value: { id: "9007199254740993" } });
});

test("standalone CRUD uses actual SQLite and records one outcome", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec("create table records (id integer primary key); insert into records values (1)");
  const registry: Metric.MetricRegistry = new Map();
  const logs: unknown[] = [];
  const instrumentation = Context.empty().pipe(
    Context.add(
      References.CurrentLoggers,
      new Set([Logger.make((options) => logs.push(options.message))]),
    ),
    Context.add(References.MinimumLogLevel, "Info"),
    Context.add(Metric.MetricRegistry, registry),
  );
  const service = defineDrizzleService({
    schema: { records },
    client: () => drizzle({ client: sqlite }),
    dispose: () => sqlite.close(),
  });
  const active = await activateDrizzleService(service, {}, { isolated: true, instrumentation });
  try {
    logs.length = 0;
    registry.clear();
    const owner = owners.get(active)!;
    const declaration = drizzleRuntimeOf(service);
    const result = await owner.run(
      owner.service.work(
        operationEffect(
          {
            drizzle: active.client,
            table: records,
            dialect: "sqlite",
            inTransaction: false,
            metadata: declaration.metadata.records!,
            schemas: declaration.effectSchemas.records!,
            override: {},
            run: (effect) => owner.run(effect),
          },
          "findMany",
          {},
        ),
      ),
    );
    const counters = [...registry.values()].filter(
      (metric) => metric.id === "relkit_execution_operations_total",
    );
    console.log(JSON.stringify({ result, logs: logs.length, counters: counters.length }));
    expect(result).toEqual([{ id: 1 }]);
    expect(logs).toHaveLength(1);
    expect(counters).toHaveLength(1);
    expect(counters[0]!.hooks.get(Context.empty()).count).toBe(1);
  } finally {
    await active.close();
  }
});
