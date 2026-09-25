import { expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import {
  createObservabilityCollector,
  makeObservabilityCollectorEffect,
  ObservabilityCollectorService,
  observabilityCollectorLayer,
  type ObservabilityRecord,
} from "../src/index.ts";

test("collector admits redacted records and retains only its bounded newest window", () => {
  const collector = createObservabilityCollector({ maxRecords: 2 });
  collector.emit({
    type: "log.emitted",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "safe",
    fields: { token: "top-secret-token", visible: "yes" },
  });
  collector.emit({
    version: 2,
    signal: "diagnostic",
    code: "RELKIT_TEST",
    severity: "info",
    message: "first",
    occurredAt: "2026-08-16T00:00:00.001Z",
  });
  collector.emit({
    version: 2,
    signal: "diagnostic",
    code: "RELKIT_TEST",
    severity: "info",
    message: "second",
    occurredAt: "2026-08-16T00:00:00.002Z",
  });

  const records = collector.read();
  expect(records).toHaveLength(2);
  expect(records.map((record) => record.signal)).toEqual(["diagnostic", "diagnostic"]);
  expect(JSON.stringify(records)).not.toContain("top-secret-token");
  expect(JSON.stringify(records)).toContain("second");
  expect(records.every((record) => Object.isFrozen(record))).toBe(true);
  expect(collector.dropped()).toBe(1);
});

test("collector Effect operations retain, clear, and report bounded metrics", () => {
  const registry = new Map();
  const record: ObservabilityRecord = {
    version: 2,
    signal: "log",
    timestamp: "2026-09-02T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "safe",
    fields: { token: "secret" },
  };
  const result = Effect.runSync(
    Effect.gen(function* () {
      const collector = yield* makeObservabilityCollectorEffect({
        maxRecords: 1,
        redaction: { mode: "development-redacted", maxBytes: 100 },
      });
      expect(yield* collector.collect(record)).toMatchObject({ signal: "log" });
      expect(yield* collector.collectRequired(record)).toMatchObject({ signal: "log" });
      expect(yield* collector.dropped()).toBe(1);
      expect(yield* collector.read()).toHaveLength(1);
      expect(
        JSON.stringify((yield* collector.capture({ token: "secret" }))?.content),
      ).not.toContain("secret");
      yield* collector.clear();
      const count = yield* Metric.value(
        Metric.counter("relkit_observability_collector_operations_total", {
          attributes: { operation: "collect", outcome: "success" },
        }),
      );
      return { retained: yield* collector.read(), count };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.retained).toEqual([]);
  expect(result.count.count).toBe(1);
});

test("collector creation has tagged validation failures and a substitutable Layer", () => {
  const registry = new Map();
  const [rejected, failureCount] = Effect.runSync(
    Effect.gen(function* () {
      const error = yield* makeObservabilityCollectorEffect({ maxRecords: 0 }).pipe(
        Effect.catchTag("ObservabilityCollectorError", (failure) => Effect.succeed(failure)),
      );
      const count = yield* Metric.value(
        Metric.counter("relkit_observability_collector_operations_total", {
          attributes: { operation: "create", outcome: "failure" },
        }),
      );
      return [error, count.count] as const;
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(rejected).toMatchObject({ _tag: "ObservabilityCollectorError", reason: "maxRecords" });
  expect(failureCount).toBe(1);
  expect(() => createObservabilityCollector({ signals: ["log", "log"] })).toThrow(TypeError);
  expect(() => createObservabilityCollector({ signals: ["invalid" as never] })).toThrow(TypeError);
  const fake = ObservabilityCollectorService.of({
    emit: () => Effect.succeed(undefined),
    collect: () => Effect.succeed(undefined),
    collectRequired: () => Effect.succeed(undefined),
    read: () => Effect.succeed([]),
    clear: () => Effect.void,
    dropped: () => Effect.succeed(99),
    capture: () => Effect.succeed(undefined),
  });
  const program = Effect.gen(function* () {
    const collector = yield* ObservabilityCollectorService;
    return yield* collector.dropped();
  });
  expect(
    Effect.runSync(
      program.pipe(Effect.provide(Layer.succeed(ObservabilityCollectorService, fake))),
    ),
  ).toBe(99);
  expect(
    Effect.runSync(program.pipe(Effect.provide(observabilityCollectorLayer({ maxRecords: 1 })))),
  ).toBe(0);
});

test("collector redaction failures stay typed in Effect and compatible synchronously", () => {
  const options = { redaction: { mode: "development-redacted" as const } };
  const record: ObservabilityRecord = {
    version: 2,
    signal: "log",
    timestamp: "2026-09-02T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "safe",
    fields: {},
  };
  const collector = Effect.runSync(makeObservabilityCollectorEffect(options));
  const captureError = Effect.runSync(
    collector
      .capture({ safe: true })
      .pipe(Effect.catchTag("ObservabilityCollectorError", (error) => Effect.succeed(error))),
  );
  const collectError = Effect.runSync(
    collector
      .collect(record)
      .pipe(Effect.catchTag("ObservabilityCollectorError", (error) => Effect.succeed(error))),
  );
  expect(captureError).toMatchObject({
    _tag: "ObservabilityCollectorError",
    reason: "redaction",
    message: "development-redacted capture requires maxBytes",
  });
  expect(collectError).toMatchObject({
    _tag: "ObservabilityCollectorError",
    reason: "redaction",
    message: "development-redacted capture requires maxBytes",
  });
  expect(() => createObservabilityCollector(options).capture({ safe: true })).toThrow(TypeError);
});
