import { expect, test } from "vitest";
import { Effect, Fiber, Metric } from "effect";
import {
  makeStreamSubscriberEffect,
  streamSubscriberLayer,
  StreamSubscriberService,
} from "../src/stream-subscriber-effect.js";
import { createStreamSubscriber } from "../src/stream-subscriber.js";
import { ObservabilityStreamError } from "../src/stream-types.js";
const event = {
  protocol: "relkit.observability.stream" as const,
  version: 1 as const,
  cursor: "1",
  type: "log.emitted" as const,
  data: { message: "ready" },
};
test("Effect consumer queues records and reports bounded metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const consumer = yield* makeStreamSubscriberEffect(
        "consumer-1",
        2,
        "drop-oldest",
        () => undefined,
        () => undefined,
      );
      yield* consumer.enqueue(event);
      const next = yield* consumer.next();
      const stats = yield* consumer.stats();
      const dropped = yield* consumer.dropped();
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_stream_consumer_total", {
          attributes: { operation: "next", outcome: "success" },
        }),
      );
      yield* consumer.close();
      return { next, stats, dropped, metric };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.next.value).toEqual(event);
  expect(result.stats.cursor).toBe("1");
  expect(result.dropped).toBe(0);
  expect(result.metric.count).toBe(1);
});
test("Effect consumer rejects invalid overflow and adapter retains public error", async () => {
  const invalid = "invalid" as "drop-oldest";
  const error = await Effect.runPromise(
    makeStreamSubscriberEffect(
      "consumer-1",
      1,
      invalid,
      () => undefined,
      () => undefined,
    ).pipe(Effect.flip),
  );
  expect(error).toMatchObject({ _tag: "StreamSubscriberError" });
  expect(() =>
    createStreamSubscriber(
      "consumer-1",
      1,
      invalid,
      () => undefined,
      () => undefined,
    ),
  ).toThrow(ObservabilityStreamError);
});
test("interrupting a pending scoped read closes the consumer and removes it", async () => {
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let removed = 0;
  const layer = streamSubscriberLayer(
    "consumer-1",
    1,
    "drop-oldest",
    () => {
      removed++;
    },
    () => undefined,
  );
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const consumer = yield* StreamSubscriberService;
      start();
      yield* consumer.next();
    }).pipe(Effect.provide(layer)),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(removed).toBe(1);
});
test("subscriber compatibility handle delegates queue, read, and iterator release", async () => {
  let removed = 0;
  const consumer = createStreamSubscriber(
    "compat",
    1,
    "drop-oldest",
    () => {
      removed++;
    },
    () => undefined,
  );
  consumer.enqueue(event);
  expect((await consumer.next()).value).toEqual(event);
  expect(consumer.dropped()).toBe(0);
  expect(consumer.stats().cursor).toBe("1");
  expect(consumer[Symbol.asyncIterator]()).toBe(consumer);
  expect((await consumer.return()).done).toBe(true);
  consumer.close();
  expect(removed).toBe(1);
});
