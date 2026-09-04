import { expect, test } from "bun:test";
import {
  admitObservabilityRecord,
  createBoundedTelemetryExportQueue,
  type RedactedObservabilityRecord,
} from "./src/index.ts";

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
