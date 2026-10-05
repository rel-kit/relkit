import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Deferred, Effect, Exit, Fiber } from "effect";
import { activateDrizzleService } from "../../src/activation.js";
import { defineDrizzleService, drizzleRuntimeOf } from "../../src/service.js";
import { operationEffect } from "../../src/operations.js";
import { transactionEffect } from "../../src/transaction.js";
import { gate, records, sqliteClient } from "./fixtures.js";

for (const stage of ["begin", "commit", "rollback"] as const) {
  it.effect(`${stage} failure releases the physical client semaphore`, () =>
    Effect.gen(function* () {
      const client = sqliteClient();
      const failure = new Error(`${stage} failed`);
      client.failures.set(stage, failure);
      const first = yield* Effect.exit(
        transactionEffect(client, "sqlite", () =>
          stage === "rollback" ? Promise.reject(new Error("primary")) : Promise.resolve(1),
        ),
      );
      expect(Exit.isFailure(first)).toBe(true);
      // A rollback-failure fake cannot know whether the physical transaction ended.
      // Reset only native fake state, not the coordinator, before proving acquisition.
      if (stage === "rollback") client.run({ queryChunks: [] } as never);
      expect(yield* transactionEffect(client, "sqlite", () => Promise.resolve(2))).toBe(2);
      if (stage === "begin") expect(client.statements).toEqual(["begin", "begin", "commit"]);
    }),
  );
}

it.effect("callback plus rollback failure remains present at the Promise edge", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const primary = new Error("callback failed");
    const cleanup = new Error("rollback failed");
    client.failures.set("rollback", cleanup);
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({ schema: { records }, client: () => client }),
        {},
      ),
    );
    const error = yield* Effect.promise(() =>
      active.context
        .transaction(() => {
          throw primary;
        })
        .catch((error: unknown) => error),
    );
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([primary, cleanup]);
    yield* Effect.promise(() => active.close());
  }),
);

it.effect("distinct Drizzle wrappers sharing $client cannot overlap SQLite BEGIN", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const wrapper = { $client: client.$client, run: client.run.bind(client) };
    const ready = yield* Deferred.make<void>();
    const completed = gate<void>();
    const first = yield* Effect.forkChild(
      transactionEffect(client, "sqlite", async () => {
        await Effect.runPromise(Deferred.succeed(ready, undefined));
        await completed.promise;
      }),
    );
    yield* Deferred.await(ready);
    const second = yield* Effect.forkChild(
      transactionEffect(wrapper, "sqlite", () => Promise.resolve(2)),
    );
    completed.resolve(undefined);
    yield* Fiber.join(first);
    expect(yield* Fiber.join(second)).toBe(2);
    expect(client.statements).toEqual(["begin", "commit", "begin", "commit"]);
  }),
);

it.effect("a cancelled permit waiter never runs BEGIN and does not strand later work", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const ready = yield* Deferred.make<void>();
    const completed = gate<void>();
    const first = yield* Effect.forkChild(
      transactionEffect(client, "sqlite", async () => {
        await Effect.runPromise(Deferred.succeed(ready, undefined));
        await completed.promise;
      }),
    );
    yield* Deferred.await(ready);
    const waiter = yield* Effect.forkChild(
      transactionEffect(client, "sqlite", () => Promise.resolve(2)),
    );
    yield* Fiber.interrupt(waiter);
    const exit = yield* Fiber.await(waiter);
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    completed.resolve(undefined);
    yield* Fiber.join(first);
    expect(yield* transactionEffect(client, "sqlite", () => Promise.resolve(3))).toBe(3);
    expect(client.statements).toEqual(["begin", "commit", "begin", "commit"]);
  }),
);

it.effect(
  "an interrupted native transaction completes before a conflicting transaction enters",
  () =>
    Effect.gen(function* () {
      const client = sqliteClient();
      const entered = yield* Deferred.make<void>();
      const waiting = yield* Deferred.make<void>();
      const completed = gate<void>();
      const first = yield* Effect.forkChild(
        transactionEffect(client, "sqlite", async () => {
          await Effect.runPromise(Deferred.succeed(entered, undefined));
          await completed.promise;
        }),
      );
      yield* Deferred.await(entered);
      const interruption = yield* Effect.forkChild(Fiber.interrupt(first));
      const second = yield* Effect.forkChild(
        Effect.andThen(
          Deferred.succeed(waiting, undefined),
          transactionEffect(client, "sqlite", () => Promise.resolve(2)),
        ),
      );
      yield* Deferred.await(waiting);
      expect(client.statements).toEqual(["begin"]);
      completed.resolve(undefined);
      yield* Fiber.join(interruption);
      expect(yield* Fiber.join(second)).toBe(2);
      expect(client.statements).toEqual(["begin", "commit", "begin", "commit"]);
    }),
);

it.effect("admitted transaction children remain usable while close waits for their parent", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const entered = yield* Deferred.make<void>();
    const completed = gate<void>();
    let disposed = 0;
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => client,
          dispose: () => {
            disposed++;
          },
          overrides: { records: { insert: ({ args }) => ({ id: args.data.id ?? 1 }) } },
        }),
        {},
      ),
    );
    const transaction = active.context.transaction(async (context) => {
      await Effect.runPromise(Deferred.succeed(entered, undefined));
      await completed.promise;
      return context.records.insert({ data: { id: 2 } });
    });
    yield* Deferred.await(entered);
    const closing = active.close();
    expect(disposed).toBe(0);
    completed.resolve(undefined);
    expect(yield* Effect.promise(() => transaction)).toEqual({ id: 2 });
    yield* Effect.promise(() => closing);
    expect(disposed).toBe(1);
    expect(client.statements).toEqual(["begin", "commit"]);
  }),
);

it.effect("standalone SQLite CRUD waits instead of joining another native transaction", () =>
  Effect.gen(function* () {
    const client = sqliteClient();
    const entered = yield* Deferred.make<void>();
    const waiting = yield* Deferred.make<void>();
    const completed = gate<void>();
    let queries = 0;
    const declaration = drizzleRuntimeOf(
      defineDrizzleService({
        schema: { records },
        client: () => client,
        overrides: {
          records: {
            findMany: () => {
              if (client.transactionActive())
                throw new Error("standalone query joined another transaction");
              queries++;
              return [];
            },
          },
        },
      }),
    );
    const metadata = declaration.metadata.records;
    const schemas = declaration.effectSchemas.records;
    if (metadata === undefined || schemas === undefined) throw new Error("missing table metadata");
    const first = yield* Effect.forkChild(
      transactionEffect(client, "sqlite", async () => {
        await Effect.runPromise(Deferred.succeed(entered, undefined));
        await completed.promise;
      }),
    );
    yield* Deferred.await(entered);
    const query = yield* Effect.forkChild(
      Effect.andThen(
        Deferred.succeed(waiting, undefined),
        operationEffect(
          {
            drizzle: client,
            table: records,
            dialect: "sqlite",
            inTransaction: false,
            metadata,
            schemas,
            override: declaration.overrides.records ?? {},
            run: (effect) => Effect.runPromise(effect),
          },
          "findMany",
          {},
        ),
      ),
    );
    yield* Deferred.await(waiting);
    expect(queries).toBe(0);
    completed.resolve(undefined);
    yield* Fiber.join(first);
    expect(yield* Fiber.join(query)).toEqual([]);
    expect(queries).toBe(1);
  }),
);
