/**
 * Local event provider housekeeping is not application telemetry: the 100 ms delivery poll and
 * the inspection query record no success logs, one query reads the durable queue a bounded
 * number of times instead of once per stored delivery, and a delivered handler still runs under
 * the application's success-log policy.
 */
import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Logger, Metric, References } from "effect";
import { ExecutionSuccessLogs } from "../../src/contracts/operation.js";
import { currentNativeEffectContext } from "../../src/runtime-effect/index.js";
import { makeLocalEventService } from "../../src/providers-local/events/provider.js";
import type { LocalEventEffects } from "../../src/providers-local/events/provider.types.js";
import type { EventRouterTrigger } from "../../src/providers-local/events/router-types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local event provider housekeeping", () => {
  test("an idle provider with stored deliveries records no success logs", async () => {
    const logs: string[] = [];
    await withProvider(
      logs,
      async () => "sent",
      (events) =>
        Effect.gen(function* () {
          yield* publishAll(events, 20);
          yield* waitForCompleted(events, 20);
          logs.length = 0;
          yield* Effect.sleep("1 second");
          // Ten idle polls per second used to log every queue read of every stored delivery.
          expect(completions(logs)).toEqual([]);
        }),
    );
  }, 30_000);

  test("a delivered handler keeps the application's success-log policy", async () => {
    const seen: boolean[] = [];
    const read = () =>
      seen.push(Context.get(currentNativeEffectContext() ?? Context.empty(), ExecutionSuccessLogs));
    await withProvider(
      [],
      async () => {
        read();
        await Promise.resolve();
        read();
        return "sent";
      },
      (events) =>
        Effect.gen(function* () {
          yield* publishAll(events, 2);
          yield* waitForCompleted(events, 2);
        }),
    );
    expect(seen).toEqual([true, true, true, true]);
  }, 30_000);

  test("a query performs the same bounded number of operations for 10 and 100 deliveries", async () => {
    const logs: string[] = [];
    await withProvider(
      logs,
      async () => "sent",
      (events) =>
        Effect.gen(function* () {
          yield* publishAll(events, 10);
          yield* waitForCompleted(events, 10);
          const few = yield* measuredQuery(events, 10);
          yield* publishAll(events, 90);
          yield* waitForCompleted(events, 100);
          logs.length = 0;
          const many = yield* measuredQuery(events, 100);
          // The ledger used to read the queue once per stored record: 811 operations at 100.
          expect(many).toBe(few);
          expect(many).toBeLessThanOrEqual(10);
          expect(completions(logs)).toEqual([]);
        }),
    );
  }, 60_000);
});

/** Runs one query over every delivery and counts the provider operations it performed.
 * @param events - Provider under test.
 * @param count - Number of stored deliveries the query must return.
 * @returns A lazy count of observed operations.
 */
function measuredQuery(events: LocalEventEffects, count: number) {
  return Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    const page = yield* events
      .query({ limit: count })
      .pipe(Effect.provideService(Metric.MetricRegistry, registry));
    expect(page.deliveries).toHaveLength(count);
    return operationCount(registry);
  });
}

/** Runs a scoped provider with one durable trigger, capturing `message operation` log lines.
 * @param logs - Mutable capture of every log line written in the provider's context.
 * @param invoke - Handler of the durable trigger.
 * @param body - Test workflow using the provider.
 * @returns A Promise settling after the provider scope, including its poll fiber, closed.
 */
async function withProvider(
  logs: string[],
  invoke: EventRouterTrigger["invoke"],
  body: (events: LocalEventEffects) => Effect.Effect<void, Error>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-event-housekeeping-"));
  roots.push(root);
  const logger = Logger.make((event) => {
    const annotations = event.fiber.getRef(References.CurrentLogAnnotations);
    logs.push(`${String(event.message)} ${String(annotations.operation ?? "")}`);
  });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const events = yield* makeLocalEventService(root);
        yield* events.registerContract({
          kind: "event",
          id: "orders.created",
          version: 1,
          input: { type: "object" },
          source: { file: "events.ts", line: 1, column: 1 },
        });
        yield* events.registerTrigger({
          id: "orders.email",
          targetFunctionId: "send-email",
          eventId: "orders.created",
          eventVersion: 1,
          delivery: "durable",
          invoke,
        });
        yield* body(events);
      }),
    ).pipe(Effect.provide(Logger.layer([logger]))),
  );
}

/** Keeps the success completion lines of captured logs. */
function completions(logs: readonly string[]): string[] {
  return logs.filter((line) => line.startsWith("Execution operation completed"));
}

/** Publishes `count` events sequentially. */
function publishAll(events: LocalEventEffects, count: number) {
  return Effect.forEach(
    Array.from({ length: count }, (_, index) => index),
    (index) =>
      events.publish(
        { orderId: `order-${index}` },
        {},
        {
          operation: "publish",
          eventId: "orders.created",
          version: 1,
          signal: new AbortController().signal,
          profile: "default",
        },
      ),
    { discard: true },
  );
}

/** Waits until the poll loop completed every durable delivery. */
function waitForCompleted(events: LocalEventEffects, count: number) {
  return Effect.gen(function* () {
    for (let attempt = 0; attempt < 600; attempt++) {
      const page = yield* events.query({ limit: count, states: ["completed"] });
      if (page.deliveries.length === count) return;
      yield* Effect.sleep("50 millis");
    }
    return yield* Effect.fail(new Error("deliveries did not complete"));
  });
}

/** Sums every observed provider operation in a metric registry. */
function operationCount(registry: Metric.MetricRegistry): number {
  let total = 0;
  for (const entry of registry.values())
    if (entry.id === "relkit_execution_operations_total")
      total += (entry.hooks.get(Context.empty()) as { count: number }).count;
  return total;
}
