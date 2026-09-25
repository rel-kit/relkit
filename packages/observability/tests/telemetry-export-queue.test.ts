import { expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import {
  admitObservabilityRecord,
  createBoundedTelemetryExportQueue,
  makeBoundedTelemetryExportQueueEffect,
  TelemetryExportQueueService,
  telemetryExportQueueLayer,
  type RedactedObservabilityRecord,
} from "../src/index.ts";

test("drops complete export units at the bounded queue edge", () => {
  const queue = createBoundedTelemetryExportQueue({ maxRecords: 3, mergeAdjacent: true });
  expect(queue.enqueue(unit("trace-a", [record("a-1")]))).toBe(true);
  expect(queue.enqueue(unit("trace-a", [record("a-2")]))).toBe(true);
  expect(queue.enqueue(unit("trace-b", [record("b-1"), record("b-2")]))).toBe(true);

  expect(queue.stats()).toEqual({
    receivedRecords: 4,
    queuedRecords: 2,
    queuedUnits: 1,
    droppedRecords: 2,
    droppedUnits: 1,
  });
  expect(queue.take()?.id).toBe("trace-b");
  expect(queue.take()).toBeUndefined();
});

test("drops the whole incoming unit when configured for newest overflow", () => {
  const queue = createBoundedTelemetryExportQueue({ maxRecords: 2, overflow: "drop-newest" });
  queue.enqueue(unit("first", [record("one")]));
  expect(queue.enqueue(unit("second", [record("two"), record("three")]))).toBe(false);
  expect(queue.stats()).toMatchObject({
    queuedRecords: 1,
    queuedUnits: 1,
    droppedRecords: 2,
    droppedUnits: 1,
  });
});

test("reports typed queue failures and success/failure metrics through Effect", () => {
  const registry = new Map();
  const result = Effect.runSync(
    Effect.gen(function* () {
      const queue = yield* makeBoundedTelemetryExportQueueEffect({ maxRecords: 2 });
      expect(yield* queue.enqueue(unit("one", [record("one")]))).toBe(true);
      const rejected = yield* queue
        .enqueue(unit("", [record("bad")]))
        .pipe(Effect.catchTag("TelemetryExportQueueError", (error) => Effect.succeed(error)));
      const successful = yield* Metric.value(
        Metric.counter("relkit_observability_export_queue_operations_total", {
          attributes: { operation: "enqueue", outcome: "success" },
        }),
      );
      const failed = yield* Metric.value(
        Metric.counter("relkit_observability_export_queue_operations_total", {
          attributes: { operation: "enqueue", outcome: "failure" },
        }),
      );
      const duration = yield* Metric.value(
        Metric.timer("relkit_observability_export_queue_duration", {
          attributes: { operation: "enqueue" },
        }),
      );
      return { rejected, successful, failed, duration };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.rejected).toMatchObject({
    _tag: "TelemetryExportQueueError",
    reason: "unit",
  });
  expect(result.successful.count).toBe(1);
  expect(result.failed.count).toBe(1);
  expect(result.duration.count).toBe(2);
});

test("the queue capability can be replaced by a deterministic Layer", () => {
  const fake = TelemetryExportQueueService.of({
    enqueue: () => Effect.succeed(false),
    take: () => Effect.succeed(undefined),
    dropAll: () => Effect.void,
    stats: () =>
      Effect.succeed({
        receivedRecords: 0,
        queuedRecords: 0,
        queuedUnits: 0,
        droppedRecords: 0,
        droppedUnits: 0,
      }),
  });
  const program = Effect.gen(function* () {
    const queue = yield* TelemetryExportQueueService;
    return yield* queue.enqueue(unit("one", [record("one")]));
  });
  expect(
    Effect.runSync(program.pipe(Effect.provide(Layer.succeed(TelemetryExportQueueService, fake)))),
  ).toBe(false);
  expect(
    Effect.runSync(program.pipe(Effect.provide(telemetryExportQueueLayer({ maxRecords: 2 })))),
  ).toBe(true);
});

test("the synchronous adapter preserves validation errors", () => {
  expect(() => createBoundedTelemetryExportQueue({ maxRecords: 0 })).toThrow(RangeError);
  const queue = createBoundedTelemetryExportQueue({ maxRecords: 1 });
  expect(() => queue.enqueue(unit("", [record("bad")]))).toThrow(TypeError);
});

test("Effect dequeue and dropAll preserve occupancy and drop counters", () => {
  const result = Effect.runSync(
    Effect.gen(function* () {
      const queue = yield* makeBoundedTelemetryExportQueueEffect({ maxRecords: 3 });
      yield* queue.enqueue(unit("first", [record("one")]));
      yield* queue.enqueue(unit("second", [record("two"), record("three")]));
      expect((yield* queue.take())?.id).toBe("first");
      yield* queue.dropAll();
      return { next: yield* queue.take(), stats: yield* queue.stats() };
    }),
  );
  expect(result.next).toBeUndefined();
  expect(result.stats).toMatchObject({
    receivedRecords: 3,
    queuedRecords: 0,
    queuedUnits: 0,
    droppedRecords: 2,
    droppedUnits: 1,
  });
});

function unit(id: string, records: readonly RedactedObservabilityRecord[]) {
  return { id, records };
}

function record(message: string): RedactedObservabilityRecord {
  return admitObservabilityRecord({
    version: 2,
    signal: "log",
    timestamp: "2026-09-02T00:00:00.000Z",
    level: "info",
    component: "test",
    message,
    fields: {},
  })!;
}
