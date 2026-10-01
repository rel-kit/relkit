import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Metric } from "effect";
import { TestClock } from "effect/testing";
import { computeTaskBuildIdEffect, publicFingerprintEffect } from "../src/jobs/build-id.js";
import { generateJobsManifestEffect } from "../src/jobs/manifest.js";
import { inputWork } from "../src/jobs/manifest-build.js";
import { observeJobs } from "../src/jobs/observability.js";
import { jobWorkerPathEffect, writeJobWorkerEntriesEffect } from "../src/jobs/worker-entries.js";
import type { NormalizedDescriptor } from "../src/normalize-types.js";

const calls = Metric.counter("relkit_compiler_jobs_operations_total", { incremental: true });
const outcomes = Metric.counter("relkit_compiler_jobs_outcomes_total", { incremental: true });
const workload = Metric.counter("relkit_compiler_jobs_workload_total", { incremental: true });

describe("jobs operation telemetry", () => {
  it.effect("records standalone domain calls and workload in the caller's registry", () =>
    Effect.gen(function* () {
      const work = inputWork({ graphHash: "hash", descriptors: [] });
      const task: NormalizedDescriptor = {
        kind: "task",
        id: "send",
        value: {},
        source: { file: "task.ts", line: 1, column: 1 },
        exportName: "send",
        exportKind: "named",
      };
      const operation = computeTaskBuildIdEffect(task, work);
      expect(
        (yield* Metric.value(Metric.withAttributes(calls, { operation: "taskBuildId" }))).count,
      ).toBe(0);
      yield* operation;
      yield* publicFingerprintEffect([]);
      for (const label of ["taskBuildId", "publicFingerprint"]) {
        expect(
          (yield* Metric.value(Metric.withAttributes(calls, { operation: label }))).count,
        ).toBe(1);
        expect(
          (yield* Metric.value(
            Metric.withAttributes(outcomes, { operation: label, outcome: "success" }),
          )).count,
        ).toBe(1);
      }
      expect(
        (yield* Metric.value(
          Metric.withAttributes(workload, { operation: "taskBuildId", kind: "tasks" }),
        )).count,
      ).toBe(1);
      expect(
        (yield* Metric.value(Metric.withAttributes(calls, { operation: "manifest" }))).count,
      ).toBe(0);
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );

  it.effect("keeps composed operation labels distinct and counts a convenience call once", () =>
    Effect.gen(function* () {
      const manifest = yield* generateJobsManifestEffect({ graphHash: "hash", descriptors: [] });
      expect(
        (yield* Metric.value(
          Metric.withAttributes(workload, { operation: "manifest", kind: "bytes" }),
        )).count,
      ).toBe(Buffer.byteLength(manifest.source, "utf8"));
      yield* writeJobWorkerEntriesEffect([], { buildDirectory: ".relkit/build" });
      for (const operation of ["manifest", "buildManifest", "publicFingerprint", "writeWorkers"]) {
        expect((yield* Metric.value(Metric.withAttributes(calls, { operation }))).count).toBe(1);
      }
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );

  it.effect("preserves and distinguishes typed failures, defects, and interruption", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.exit(
        jobWorkerPathEffect("build", { buildId: "../unsafe", serviceGeneration: "v1" }),
      );
      expect(Exit.isFailure(failure) && Cause.hasFails(failure.cause)).toBe(true);
      const defect = new Error("broken workload input");
      let reads = 0;
      const operation = observeJobs("taskBuildId", Effect.void, () => {
        reads++;
        throw defect;
      });
      expect(reads).toBe(0);
      const broken = yield* Effect.exit(operation);
      expect(reads).toBe(1);
      expect(Exit.isFailure(broken) && Cause.squash(broken.cause)).toBe(defect);
      const interrupted = yield* Effect.exit(observeJobs("routingRead", Effect.interrupt));
      expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true);
      for (const [operation, outcome] of [
        ["workerPath", "failure"],
        ["taskBuildId", "defect"],
        ["routingRead", "interrupted"],
      ] as const) {
        expect(
          (yield* Metric.value(Metric.withAttributes(outcomes, { operation, outcome }))).count,
        ).toBe(1);
        expect((yield* Metric.value(Metric.withAttributes(calls, { operation }))).count).toBe(1);
      }
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );

  it.effect("records monotonic duration exactly once on completion", () =>
    Effect.gen(function* () {
      const result = yield* observeJobs(
        "workerPath",
        TestClock.adjust("25 millis").pipe(Effect.as("done")),
      );
      expect(result).toBe("done");
      const duration = Metric.histogram("relkit_compiler_jobs_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000],
      });
      const value = yield* Metric.value(
        Metric.withAttributes(duration, { operation: "workerPath" }),
      );
      expect(value.count).toBe(1);
      expect(value.sum).toBe(25);
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );
});
