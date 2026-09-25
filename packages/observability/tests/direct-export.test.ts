import { expect, test } from "vitest";
import { Effect, Fiber, Metric } from "effect";
import {
  DirectExportService,
  directExportLayer,
  makeDirectExportEffect,
} from "../src/direct-export.js";
import { admitted } from "./telemetry-exporter-fixtures.js";
test("direct exports preserve accepted records with at most sixteen active calls", async () => {
  let active = 0;
  let peak = 0;
  let signalStart!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStart = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = await Effect.runPromise(
    makeDirectExportEffect(
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        signalStart();
        await gate;
        active -= 1;
      },
      () => undefined,
    ),
  );
  for (let index = 0; index < 100; index++)
    expect(Effect.runSync(queue.enqueue({ record: admitted(), decision: "export" }))).toBe(true);
  await started;
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThanOrEqual(16);
  release();
  await Effect.runPromise(queue.close());
  expect(active).toBe(0);
});
test("capacity failures are typed and remain visible through flush", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const failures: string[] = [];
  const queue = await Effect.runPromise(
    makeDirectExportEffect(
      () => gate,
      (error) => failures.push(error.reason),
    ),
  );
  let rejected = 0;
  for (let index = 0; index < 1_100; index++)
    if (!Effect.runSync(queue.enqueue({ record: admitted(), decision: "export" }))) rejected++;
  expect(rejected).toBeGreaterThan(0);
  expect(failures).toHaveLength(rejected);
  release();
  const error = await Effect.runPromise(queue.close().pipe(Effect.flip));
  expect(error).toMatchObject({ _tag: "DirectExportError", reason: "capacity" });
});
test("success and failure metrics use bounded operation labels", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const queue = yield* makeDirectExportEffect(
        async () => {
          throw new Error("export failed");
        },
        () => undefined,
      );
      yield* queue.enqueue({ record: admitted(), decision: "export" });
      const failure = yield* queue.flush().pipe(Effect.flip);
      const succeeded = yield* Metric.value(
        Metric.counter("relkit_observability_direct_export_operations_total", {
          attributes: { operation: "enqueue", outcome: "success" },
        }),
      );
      const failed = yield* Metric.value(
        Metric.counter("relkit_observability_direct_export_operations_total", {
          attributes: { operation: "flush", outcome: "failure" },
        }),
      );
      yield* queue.shutdown();
      return { failure, succeeded, failed };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.failure).toMatchObject({ _tag: "DirectExportError", reason: "export" });
  expect(result.succeeded.count).toBe(1);
  expect(result.failed.count).toBe(1);
});
test("interrupting a Layer user aborts its active export", async () => {
  let started!: () => void;
  const exporting = new Promise<void>((resolve) => {
    started = resolve;
  });
  let aborted = false;
  const layer = directExportLayer(
    (_record, _decision, signal) =>
      new Promise<void>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
        started();
      }),
    () => undefined,
  );
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const queue = yield* DirectExportService;
      yield* queue.enqueue({ record: admitted(), decision: "export" });
      yield* Effect.never;
    }).pipe(Effect.provide(layer)),
  );
  await exporting;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(aborted).toBe(true);
});
