import { PgClient, type PgConnection } from "@effect/sql-pg";
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Queue, Stream } from "effect";
import { ConnectionError, SqlError } from "effect/sql/SqlError";
import { JobStore } from "effect-mq";
import { DrizzleJobStore } from "effect-mq/drizzle-postgres";
import { createEffectMqPostgresSchema } from "../src/postgres.js";
import { EffectMqPgCompatibility, effectMqListen } from "../src/postgres-listen.js";

it.effect("preserves SQL calls and non-LISTEN helpers without mutating the native client", () =>
  Effect.gen(function* () {
    const result = Effect.succeed([]);
    const notifications = yield* Queue.unbounded<PgConnection.Notification>();
    const listen = () => Effect.succeed(notifications);
    const notify = () => Effect.void;
    const native = Object.assign(() => result, { listen, notify }) as unknown as PgClient.PgClient;
    const compatible = yield* PgClient.PgClient.pipe(
      Effect.provide(EffectMqPgCompatibility),
      Effect.provideService(PgClient.PgClient, native),
    );
    expect(compatible`SELECT 1`).toBe(result);
    expect(compatible.notify).toBe(notify);
    expect(native.listen).toBe(listen);
    expect(compatible.listen).not.toBe(listen);
  }),
);

it.effect("adapts payloads lazily and releases each LISTEN subscription", () =>
  Effect.gen(function* () {
    let opened = 0;
    let closed = 0;
    const listen: PgClient.PgClient["listen"] = (channel) =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          opened++;
          expect(channel).toBe("wake");
          const queue = yield* Queue.unbounded<PgConnection.Notification>();
          yield* Queue.offer(queue, { channel, payload: "queue-a", processId: 7 });
          yield* Queue.offer(queue, { channel, payload: "*", processId: 8 });
          return queue;
        }),
        (queue) =>
          Effect.sync(() => {
            closed++;
          }).pipe(Effect.andThen(Queue.shutdown(queue))),
      );
    const stream = effectMqListen({ listen }, "wake");
    expect(opened).toBe(0);
    expect(yield* Stream.runCollect(stream.pipe(Stream.take(2)))).toEqual(["queue-a", "*"]);
    expect([opened, closed]).toEqual([1, 1]);
    expect(yield* Stream.runCollect(stream.pipe(Stream.take(1)))).toEqual(["queue-a"]);
    expect([opened, closed]).toEqual([2, 2]);
  }),
);

it.effect("releases a listener interrupted while waiting for notifications", () =>
  Effect.gen(function* () {
    const listening = yield* Deferred.make<void>();
    let closed = 0;
    const stream = effectMqListen(
      {
        listen: () =>
          Effect.acquireRelease(
            Queue.unbounded<PgConnection.Notification>().pipe(
              Effect.tap(() => Deferred.succeed(listening, undefined)),
            ),
            (queue) =>
              Effect.sync(() => {
                closed++;
              }).pipe(Effect.andThen(Queue.shutdown(queue))),
          ),
      },
      "wake",
    );
    const fiber = yield* Stream.runDrain(stream).pipe(Effect.forkChild);
    yield* Deferred.await(listening);
    yield* Fiber.interrupt(fiber);
    expect(closed).toBe(1);
  }),
);

it.effect("retains the native SQL acquisition failure for SDK resubscription", () =>
  Effect.gen(function* () {
    const failure = new SqlError({
      reason: new ConnectionError({ cause: new Error("offline"), message: "LISTEN unavailable" }),
    });
    const result = yield* effectMqListen({ listen: () => Effect.fail(failure) }, "wake").pipe(
      Stream.runCollect,
      Effect.result,
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBe(failure);
  }),
);

it.effect("wakes the installed Drizzle store for queue and broadcast notifications", () =>
  Effect.gen(function* () {
    let closed = 0;
    const notifications = yield* Queue.unbounded<PgConnection.Notification>();
    const listening = yield* Deferred.make<void>();
    const listen: PgClient.PgClient["listen"] = (channel) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          expect(channel).toBe("effect_mq_wake_listen_test");
          return notifications;
        }).pipe(Effect.tap(() => Deferred.succeed(listening, undefined))),
        () =>
          Effect.sync(() => {
            closed++;
          }),
      );
    // Validation is disabled below; this SDK regression needs no query implementation.
    const native = Object.assign(
      () => {
        throw new Error("Unexpected SQL query");
      },
      { listen },
    ) as unknown as PgClient.PgClient;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const store = yield* DrizzleJobStore.make({
          ...createEffectMqPostgresSchema("listen_test"),
          validate: false,
        }).pipe(
          Effect.provide(EffectMqPgCompatibility),
          Effect.provideService(PgClient.PgClient, native),
        );
        yield* Deferred.await(listening);
        expect(native.listen).toBe(listen);
        yield* Queue.offer(notifications, {
          channel: "effect_mq_wake_listen_test",
          processId: 1,
          payload: "queue-a",
        });
        yield* store.awaitWake([JobStore.QueueName("queue-a")], 0);
        yield* Queue.offer(notifications, {
          channel: "effect_mq_wake_listen_test",
          processId: 1,
          payload: "*",
        });
        yield* store.awaitWake([JobStore.QueueName("other-queue")], 1);
      }),
    );
    expect(closed).toBe(1);
  }),
);
