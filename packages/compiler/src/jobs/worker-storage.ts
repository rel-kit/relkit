import { observeJobs } from "./observability.js";
import { readFile } from "node:fs/promises";
import { Context, Effect, Layer, Schema } from "effect";
import { writeIfChangedEffect } from "../generated-artifacts-write.js";
import { isMissing } from "./worker-entries-support.js";
import type { JobWorkerStorageOperations } from "./worker-storage.types.js";

/** Expected filesystem failure retaining operation, path, and original rejection. */
export class JobWorkerStorageError extends Schema.TaggedError<JobWorkerStorageError>()(
  "JobWorkerStorageError",
  { operation: Schema.Literals(["read", "write"]), path: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Explicit authority for worker I/O; callers can supply deterministic test storage.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { JobWorkerStorage, JobWorkerStorageLive } from "./worker-storage.js";
 * const read = Effect.gen(function* () {
 *   const storage = yield* JobWorkerStorage;
 *   return yield* storage.read(".relkit/build/jobs/routing.manifest.json");
 * }).pipe(Effect.provide(JobWorkerStorageLive));
 * const exit = await Effect.runPromise(Effect.exit(read));
 * ```
 */
export class JobWorkerStorage extends Context.Service<
  JobWorkerStorage,
  JobWorkerStorageOperations
>()("@relkit/compiler/Jobs/WorkerStorage") {}

/**
 * Reads an artifact with abort-aware Node I/O and recovers only missing paths.
 * @param path - Full artifact path.
 * @returns A lazy effect yielding UTF-8 text or undefined, with typed storage failures.
 */
const readWorkerFile = Effect.fn("Jobs.readWorkerFile")(
  function* (path: string) {
    return yield* Effect.tryPromise({
      try: (signal) => readFile(path, { encoding: "utf8", signal }),
      catch: (cause) => new JobWorkerStorageError({ operation: "read", path, cause }),
    }).pipe(
      Effect.catchTag("JobWorkerStorageError", (error) =>
        isMissing(error.cause) ? Effect.succeed(undefined) : Effect.fail(error),
      ),
    );
  },
  (effect, path) =>
    observeJobs(
      "readWorkerFile",
      effect,
      () => ({ files: 1 }),
      (source) => ({ bytes: source === undefined ? 0 : Buffer.byteLength(source, "utf8") }),
    ),
);

/**
 * Writes through the established atomic writer and waits for cleanup on interruption.
 * @param path - Full artifact path.
 * @param content - Canonical UTF-8 bytes.
 * @returns A lazy effect yielding the write report or a typed storage failure.
 * @remarks Only this atomic write is uninterruptible; preflight and between-write cancellation remain available.
 */
const writeWorkerFile = Effect.fn("Jobs.writeWorkerFile")(
  function* (path: string, content: string) {
    return yield* writeIfChangedEffect(path, content).pipe(
      Effect.mapError(
        (error) => new JobWorkerStorageError({ operation: "write", path, cause: error.cause }),
      ),
    );
  },
  (effect, path, content) =>
    observeJobs("writeWorkerFile", effect, () => ({
      files: 1,
      bytes: Buffer.byteLength(content, "utf8"),
    })),
);

/**
 * Node implementation; the artifact writer owns temporary files and cleanup.
 * @see {@link JobWorkerStorage} for service provisioning and execution.
 */
export const JobWorkerStorageLive = Layer.effect(
  JobWorkerStorage,
  Effect.gen(function* () {
    return JobWorkerStorage.of({ read: readWorkerFile, write: writeWorkerFile });
  }),
);
