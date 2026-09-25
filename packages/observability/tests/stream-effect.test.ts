import { Effect, Fiber, Metric } from "effect";
import { expect, test } from "vitest";
import {
  createObservabilityStream,
  makeObservabilityStreamEffect,
  observabilityStreamLayer,
  ObservabilityStreamService,
} from "../src/stream.js";
import { ObservabilityStreamError } from "../src/stream-types.js";
import type { ObservabilityStreamSubscription } from "../src/stream-types.js";
test("Effect stream reports tagged failures and operation outcomes", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const stream = yield* makeObservabilityStreamEffect({ maxEvents: 1 });
      yield* stream.publish({ type: "log.emitted", data: { message: "first" } });
      const page = yield* stream.replay();
      const failure = yield* stream.replay({ cursor: "2" }).pipe(Effect.flip);
      const successes = yield* Metric.value(
        Metric.counter("relkit_observability_stream_operations_total", {
          attributes: { operation: "replay", outcome: "success" },
        }),
      );
      const failures = yield* Metric.value(
        Metric.counter("relkit_observability_stream_operations_total", {
          attributes: { operation: "replay", outcome: "failure" },
        }),
      );
      yield* stream.close();
      return { page, failure, successes, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.page.events).toHaveLength(1);
  expect(result.failure).toMatchObject({ _tag: "StreamOperationError", kind: "stream" });
  expect(result.successes.count).toBe(1);
  expect(result.failures.count).toBe(1);
  const stream = createObservabilityStream();
  expect(() => stream.replay({ cursor: "2" })).toThrow(ObservabilityStreamError);
  stream.close();
});
test("interrupting a scoped stream closes pending consumers", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let consumer!: ObservabilityStreamSubscription;
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const stream = yield* ObservabilityStreamService;
      consumer = yield* stream.subscribe();
      started();
      yield* Effect.tryPromise(() => consumer.next());
    }).pipe(Effect.provide(observabilityStreamLayer())),
  );
  await ready;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(consumer.stats().closed).toBe(true);
});
