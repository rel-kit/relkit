import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  admitObservabilityRecord,
  admitObservabilityRecordEffect,
  isRedactedObservabilityRecordEffect,
} from "../src/record-admission.js";
import type { RedactionPolicy } from "../src/redaction.js";
const record = {
  version: 2 as const,
  signal: "log" as const,
  timestamp: "2026-09-25T00:00:00.000Z",
  level: "info" as const,
  component: "test",
  message: "ready",
};
test("Effect admission brands a redacted record and tracks success", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const admitted = yield* admitObservabilityRecordEffect(record);
      const branded = yield* isRedactedObservabilityRecordEffect(admitted);
      const unbranded = yield* isRedactedObservabilityRecordEffect(record);
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_record_admission_total", {
          attributes: { operation: "admit", outcome: "success" },
        }),
      );
      return { admitted, branded, unbranded, metric };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.admitted).toMatchObject({ signal: "log", fields: {} });
  expect(result.branded).toBe(true);
  expect(result.unbranded).toBe(false);
  expect(result.metric.count).toBe(1);
});
test("Effect admission tags redaction errors and adapter retains TypeError", async () => {
  const policy = { mode: "invalid" } as unknown as RedactionPolicy;
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const error = yield* admitObservabilityRecordEffect(record, policy).pipe(Effect.flip);
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_record_admission_total", {
          attributes: { operation: "admit", outcome: "failure" },
        }),
      );
      return { error, metric };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.error).toMatchObject({ _tag: "RecordAdmissionError" });
  expect(result.metric.count).toBe(1);
  expect(() => admitObservabilityRecord(record, policy)).toThrow(TypeError);
});
