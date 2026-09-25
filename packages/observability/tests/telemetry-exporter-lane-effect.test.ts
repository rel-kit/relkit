import { Effect, Metric } from "effect";
import { expect, test } from "vitest";
import {
  createLane,
  createLaneEffect,
  dispatchLane,
  dispatchLaneEffect,
  flushLane,
  flushLaneEffect,
  settleLane,
  settleLaneEffect,
} from "../src/telemetry-exporter-lane.js";
import { telemetryExporterFactory } from "../src/telemetry-exporter-resolution.js";
import { admitted, exporter, runtimeModule, sink } from "./telemetry-exporter-fixtures.js";
test("Effect lane dispatches accepted work and reports operation metrics", async () => {
  const registry = new Map();
  const sent: string[] = [];
  const descriptor = exporter("one");
  const modules = [
    runtimeModule("one", () =>
      sink((record) => {
        sent.push(record.signal);
      }),
    ),
  ];
  const failures: unknown[] = [];
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const lane = yield* createLaneEffect(
        "one",
        descriptor,
        telemetryExporterFactory(descriptor, modules),
        { modules, values: { EXPORT_TOKEN: "safe" } },
        (failure) => failures.push(failure),
      );
      yield* dispatchLaneEffect(lane, admitted(), "export", (failure) => failures.push(failure));
      yield* flushLaneEffect(lane, 1000, (failure) => failures.push(failure));
      const dispatches = yield* Metric.value(
        Metric.counter("relkit_telemetry_lane_operations_total", {
          attributes: { operation: "dispatch", outcome: "success" },
        }),
      );
      yield* settleLaneEffect(
        lane,
        () => lane.runtime?.close?.(),
        (failure) => failures.push(failure),
      );
      return { lane, dispatches };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(sent).toEqual(["log"]);
  expect(result.lane.exported).toBe(1);
  expect(result.dispatches.count).toBe(1);
  expect(failures).toEqual([]);
});
test("Effect lane contains runtime factory failure as a failed lane", async () => {
  const descriptor = exporter("one");
  const modules = [
    runtimeModule("one", () => {
      throw new Error("secret");
    }),
  ];
  const failures: unknown[] = [];
  const lane = await Effect.runPromise(
    createLaneEffect(
      "one",
      descriptor,
      telemetryExporterFactory(descriptor, modules),
      { modules, values: { EXPORT_TOKEN: "safe" } },
      (failure) => failures.push(failure),
    ),
  );
  expect(lane.runtime).toBeUndefined();
  expect(lane.failures).toBe(1);
  expect(JSON.stringify(failures)).not.toContain("secret");
});
test("lane compatibility adapters delegate dispatch and lifecycle operations", async () => {
  const descriptor = exporter("one");
  const sent: string[] = [];
  const modules = [
    runtimeModule("one", () =>
      sink((record) => {
        sent.push(record.signal);
      }),
    ),
  ];
  const failures: unknown[] = [];
  const report = (failure: unknown) => failures.push(failure);
  const lane = await createLane(
    "one",
    descriptor,
    telemetryExporterFactory(descriptor, modules),
    { modules, values: { EXPORT_TOKEN: "safe" } },
    report,
  );
  dispatchLane(lane, admitted(), "export", report);
  await flushLane(lane, 1000, report);
  await settleLane(lane, () => lane.runtime?.close?.(), report);
  expect(sent).toEqual(["log"]);
  expect(lane.exported).toBe(1);
  expect(failures).toEqual([]);
});
