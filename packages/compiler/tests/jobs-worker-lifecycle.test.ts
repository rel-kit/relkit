import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Metric, Ref } from "effect";
import {
  JobWorkerStorage,
  JobWorkerStorageError,
  jobWorkerPath,
  jobWorkerPathEffect,
  writeJobWorkerEntries,
  writeJobWorkerEntriesWithStorageEffect,
} from "../src/jobs/worker-entries.js";
import type { JobsManifestWorkerEntry } from "../src/jobs/manifest.types.js";
import type { JobWorkerStorageOperations } from "../src/jobs/worker-storage.types.js";

const entry: JobsManifestWorkerEntry = {
  jobId: "orders.public",
  taskId: "orders.send",
  buildId: "build-one",
  serviceGeneration: "generation-one",
  path: "unused",
};

describe("worker lifecycle", () => {
  it.effect("keeps path failures typed and preserves the legacy TypeError", () =>
    Effect.gen(function* () {
      const invalid = { ...entry, buildId: "../escape" };
      const failure = yield* jobWorkerPathEffect("/build", invalid).pipe(Effect.flip);
      expect(failure._tag).toBe("JobWorkerPathError");
      expect(failure.cause).toBeInstanceOf(TypeError);
      expect(() => jobWorkerPath("/build", invalid)).toThrow(
        "Job worker buildId must be one safe path segment.",
      );
      yield* Effect.promise(() =>
        expect(
          writeJobWorkerEntries([invalid], { buildDirectory: "/build" }),
        ).rejects.toBeInstanceOf(TypeError),
      );
    }),
  );

  it.effect("exposes storage context and never starts writes after preflight I/O failure", () =>
    Effect.gen(function* () {
      const writes = yield* Ref.make(0);
      const cause = new Error("permission denied");
      const storage: JobWorkerStorageOperations = {
        read: (path) => Effect.fail(new JobWorkerStorageError({ operation: "read", path, cause })),
        write: () =>
          Ref.update(writes, (count) => count + 1).pipe(
            Effect.as({ path: "unused", fileName: "unused", changed: true, bytes: 0 }),
          ),
      };
      const failure = yield* writeJobWorkerEntriesWithStorageEffect([entry], {
        buildDirectory: "/build",
      }).pipe(Effect.provide(Layer.succeed(JobWorkerStorage, storage)), Effect.flip);
      expect(failure).toMatchObject({ _tag: "JobWorkerStorageError", operation: "read", cause });
      expect(yield* Ref.get(writes)).toBe(0);
    }),
  );

  it.effect(
    "interrupts concurrent preflight, finalizes reads, and records cancellation without writing",
    () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const finalized = yield* Ref.make(0);
        const writes = yield* Ref.make(0);
        const storage: JobWorkerStorageOperations = {
          read: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              return yield* Effect.never;
            }).pipe(Effect.ensuring(Ref.update(finalized, (count) => count + 1))),
          write: () =>
            Ref.update(writes, (count) => count + 1).pipe(
              Effect.as({ path: "unused", fileName: "unused", changed: true, bytes: 0 }),
            ),
        };
        const workflow = writeJobWorkerEntriesWithStorageEffect([entry], {
          buildDirectory: "/build",
        });
        expect(yield* Ref.get(finalized)).toBe(0);
        const fiber = yield* workflow.pipe(
          Effect.provide(Layer.succeed(JobWorkerStorage, storage)),
          Effect.forkScoped,
        );
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        expect(yield* Ref.get(finalized)).toBe(1);
        expect(yield* Ref.get(writes)).toBe(0);
        const count = yield* Metric.value(
          Metric.withAttributes(
            Metric.counter("relkit_compiler_jobs_outcomes_total", { incremental: true }),
            { operation: "writeWorkers", outcome: "interrupted" },
          ),
        );
        expect(count.count).toBe(1);
      }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );

  it.effect("waits for an atomic write's finalization before interruption completes", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const finalized = yield* Ref.make(false);
      const writes = yield* Ref.make(0);
      const storage: JobWorkerStorageOperations = {
        read: () => Effect.succeed(undefined),
        write: (path, content) =>
          Effect.gen(function* () {
            yield* Ref.update(writes, (count) => count + 1);
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
            return { path, fileName: "worker.js", changed: true, bytes: content.length };
          }).pipe(Effect.ensuring(Ref.set(finalized, true)), Effect.uninterruptible),
      };
      const fiber = yield* writeJobWorkerEntriesWithStorageEffect([entry], {
        buildDirectory: "/build",
      }).pipe(Effect.provide(Layer.succeed(JobWorkerStorage, storage)), Effect.forkScoped);
      yield* Deferred.await(started);
      // Start the interruption request before releasing the atomic write.
      const interruptor = yield* Fiber.interrupt(fiber).pipe(
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(interruptor);
      expect(yield* Ref.get(finalized)).toBe(true);
      expect(yield* Ref.get(writes)).toBe(1);
    }),
  );
});
