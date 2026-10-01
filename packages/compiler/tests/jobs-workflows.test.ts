import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Metric } from "effect";
import { createDiagnostic } from "@relkit/diagnostics";
import { buildManifestEffect, inputWork } from "../src/jobs/manifest-build.js";
import { generateJobsManifest, generateJobsManifestEffect } from "../src/jobs/manifest.js";
import { validateJobNamesEffect } from "../src/jobs/names.js";
import { discoverTaskJobsEffect } from "../src/jobs/discover.js";
import { computeTaskBuildId, computeTaskBuildIdEffect } from "../src/jobs/build-id.js";
import type { NormalizedDescriptor } from "../src/normalize-types.js";

/**
 * Builds a normalized test descriptor without running unrelated compiler passes.
 * @param kind - Descriptor kind for the scoped workflow.
 * @param id - Stable descriptor identity.
 * @param value - Authoring value or evaluator snapshot.
 * @returns A descriptor with deterministic source provenance.
 */
const descriptor = (kind: string, id: string, value: unknown): NormalizedDescriptor => ({
  kind,
  id,
  value,
  source: { file: "jobs.ts", line: 1, column: 1 },
  exportName: "sendEmail",
  exportKind: "named",
});

const taskValue = { ref: { kind: "task", id: "orders.send" }, version: "1", execution: "durable" };
const task = descriptor("task", "orders.send", taskValue);
const job = descriptor("job", "orders.public", {
  task: taskValue,
  name: "sendEmail",
  client: { public: true, operations: ["trigger"] },
  schedules: [{ id: "daily", every: "1 day", input: { secret: "accepted-only" } }],
});

describe("jobs domain effects", () => {
  it.effect(
    "defers discovery and resolves normalized task references without creating implicit duplicates",
    () =>
      Effect.gen(function* () {
        const work = inputWork({ graphHash: "hash", descriptors: [task, job] });
        const workflow = discoverTaskJobsEffect(work);
        expect(work.descriptors).toHaveLength(2);
        yield* workflow;
        expect(work.descriptors).toEqual([task, job]);
        expect(work.diagnostics).toEqual([]);
      }),
  );

  it.effect("defers validation and records bounded workload on the caller's registry", () =>
    Effect.gen(function* () {
      const invalid = descriptor("job", "orders.invalid", { task: taskValue, name: "then" });
      const work = inputWork({ graphHash: "hash", descriptors: [task, invalid] });
      const workflow = validateJobNamesEffect(work);
      expect(work.diagnostics).toEqual([]);
      yield* workflow;
      expect(work.diagnostics).toHaveLength(1);
      expect(work.diagnostics[0]?.message).toContain('Job name "then" is invalid');
      const metric = Metric.counter("relkit_compiler_jobs_workload_total", { incremental: true });
      const count = yield* Metric.value(
        Metric.withAttributes(metric, {
          operation: "validateNames",
          kind: "descriptors",
        }),
      );
      expect(count.count).toBe(2);
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );

  it.effect(
    "preserves manifest bytes, sorted identities, and payload exclusion at the synchronous edge",
    () =>
      Effect.gen(function* () {
        const input = { graphHash: "hash", descriptors: [job, task], environment: "test" };
        const first = yield* generateJobsManifestEffect(input);
        const second = yield* generateJobsManifestEffect(input);
        expect(first).toEqual(second);
        expect(generateJobsManifest(input)).toEqual(first);
        expect(first.activatable).toBe(true);
        expect(first.value?.tasks[0]?.id).toBe(task.id);
        expect(first.value?.jobs[0]?.taskId).toBe(task.id);
        expect(first.source).not.toContain("accepted-only");
        expect(first.value?.workerEntries[0]?.buildId).toBe(first.value?.jobs[0]?.buildId);
      }),
  );

  it.effect("denies activation when prerequisite diagnostics contain an error", () =>
    Effect.gen(function* () {
      const result = yield* generateJobsManifestEffect({
        graphHash: "hash",
        descriptors: [task, job],
        diagnostics: [createDiagnostic({ code: "TEST", severity: "error", message: "blocked" })],
      });
      expect(result).toEqual({ source: "", diagnostics: [], activatable: false });
    }),
  );

  it.effect("retains schema construction issues in the typed failure channel", () =>
    Effect.gen(function* () {
      const input = { graphHash: "hash", descriptors: [] };
      const exit = yield* buildManifestEffect(
        input,
        inputWork(input),
        [
          {
            id: "invalid",
            graphId: "task.invalid",
            version: "1",
            execution: "durable",
            buildId: "build",
            schemaHashes: {},
            policy: Number.NaN,
            dependencies: {},
            publishes: [],
            resources: {},
          },
        ],
        [],
      ).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasFails(exit.cause)).toBe(true);
        expect(Cause.hasDies(exit.cause)).toBe(false);
      }
    }),
  );

  it.effect("retains descriptor getter defects and the original synchronous exception", () =>
    Effect.gen(function* () {
      const defect = new Error("unavailable executable");
      const broken = descriptor("task", task.id, {
        get input(): unknown {
          throw defect;
        },
      });
      const work = inputWork({ graphHash: "hash", descriptors: [broken] });
      const exit = yield* computeTaskBuildIdEffect(broken, work).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
        expect(Cause.squash(exit.cause)).toBe(defect);
      }
      expect(() => computeTaskBuildId(broken, work)).toThrow(defect);
    }),
  );
});
