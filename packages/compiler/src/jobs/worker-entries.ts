import { dirname, join } from "node:path";
import { Effect } from "effect";
import type { JobsManifestWorkerEntry } from "./manifest.types.js";
import { runJobsPromise, runJobsSync } from "./compatibility.js";
import { observeJobs, recordJobsWorkload } from "./observability.js";
import { assertSegmentEffect } from "./worker-entries-support.js";
import { JobWorkerConflictError } from "./worker-errors.js";
import { JobWorkerStorage, JobWorkerStorageLive } from "./worker-storage.js";
import {
  mergeRoutingEntriesEffect,
  readRoutingManifestEffect,
  renderRoutingEffect,
  renderWorkerEffect,
} from "./worker-routing.js";
import type {
  JobWorkerWriteOptions,
  JobWorkerWriteReport,
  PendingWorker,
} from "./worker-entries.types.js";

export { JobWorkerConflictError } from "./worker-errors.js";
export { JobWorkerStorage, JobWorkerStorageLive, JobWorkerStorageError } from "./worker-storage.js";
export type { JobWorkerWriteOptions, JobWorkerWriteReport } from "./worker-entries.types.js";

/**
 * Resolves a worker path after validating both immutable identity segments.
 * @param buildDirectory - Root of compiler-owned build artifacts.
 * @param entry - Build and service generation identity.
 * @returns A lazy effect yielding the full worker path or failing with JobWorkerPathError.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { jobWorkerPathEffect } from "./worker-entries.js";
 * const path = jobWorkerPathEffect(".relkit/build", { buildId: "../invalid", serviceGeneration: "v1" })
 *   .pipe(Effect.catchTag("JobWorkerPathError", () => Effect.succeed(undefined)));
 * const resolved = Effect.runSync(path);
 * ```
 */
export const jobWorkerPathEffect = Effect.fn("Jobs.jobWorkerPath")(
  function* (
    buildDirectory: string,
    entry: Pick<JobsManifestWorkerEntry, "buildId" | "serviceGeneration">,
  ) {
    yield* assertSegmentEffect(entry.buildId, "buildId");
    yield* assertSegmentEffect(entry.serviceGeneration, "serviceGeneration");
    return join(buildDirectory, "jobs", entry.buildId, entry.serviceGeneration, "worker.js");
  },
  (effect, buildDirectory, entry) => observeJobs("workerPath", effect, () => ({ workers: 1 })),
);

/**
 * Resolves the immutable worker path at a synchronous compatibility edge.
 * @param buildDirectory - Root of build artifacts.
 * @param entry - Compiled build and service generation.
 * @returns The full worker path.
 * @throws TypeError for an unsafe identity segment.
 * @see {@link jobWorkerPathEffect} for composition and execution examples.
 */
export function jobWorkerPath(
  buildDirectory: string,
  entry: Pick<JobsManifestWorkerEntry, "buildId" | "serviceGeneration">,
): string {
  return runJobsSync(
    jobWorkerPathEffect(buildDirectory, entry).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Preflights every worker and routing group before writing any artifact.
 * @param entries - Accepted job bindings, grouped by immutable worker identity.
 * @param options - Root of compiler-owned build artifacts.
 * @returns A lazy effect yielding a frozen write report; typed failures are path, conflict, storage, and JSON errors.
 * @remarks Requires JobWorkerStorage. Preflight and writes are concurrent; reports retain group order. Cancellation
 * interrupts preflight; each atomic write completes its cleanup before interruption can proceed.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { JobWorkerStorageLive, writeJobWorkerEntriesWithStorageEffect } from "./worker-entries.js";
 * // entries are accepted manifest worker entries; replace the layer with test storage as needed.
 * const write = writeJobWorkerEntriesWithStorageEffect(entries, { buildDirectory: ".relkit/build" })
 *   .pipe(Effect.provide(JobWorkerStorageLive));
 * const exit = await Effect.runPromise(Effect.exit(write)); // Includes atomic-write cleanup.
 * ```
 */
export const writeJobWorkerEntriesWithStorageEffect = Effect.fn("Jobs.writeJobWorkerEntries")(
  function* (entries: readonly JobsManifestWorkerEntry[], options: JobWorkerWriteOptions) {
    const storage = yield* JobWorkerStorage;
    const groups = new Map<string, JobsManifestWorkerEntry[]>();
    yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.gen(function* () {
          const path = yield* jobWorkerPathEffect(options.buildDirectory, entry);
          const group = groups.get(path) ?? [];
          group.push(entry);
          groups.set(path, group);
        }),
      { discard: true },
    );
    const pending = yield* Effect.forEach(
      [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ([path, group]) => prepareWorkerEffect(path, group),
      { concurrency: "unbounded" },
    );
    // Every conflict is detected before the first write can activate a new build.
    yield* assertImmutableEffect(pending);
    const workers = yield* Effect.forEach(
      pending,
      (entry) => storage.write(entry.path, entry.content),
      { concurrency: "unbounded" },
    );
    const routingManifests = yield* Effect.forEach(
      pending,
      (entry) => storage.write(entry.routing, entry.routingContent),
      { concurrency: "unbounded" },
    );
    const changed =
      workers.some((entry) => entry.changed) || routingManifests.some((entry) => entry.changed);
    yield* recordJobsWorkload("writeWorkers", {
      workers: workers.length,
      routingManifests: routingManifests.length,
      changed: Number(changed),
    });
    return Object.freeze({
      workers: Object.freeze(workers),
      routingManifests: Object.freeze(routingManifests),
      changed,
    });
  },
  (effect) => observeJobs("writeWorkers", effect),
);

/**
 * Writes compiler-owned workers using the explicit Node storage implementation.
 * @param entries - Accepted job bindings.
 * @param options - Filesystem build root.
 * @returns A lazy effect yielding a frozen write report with typed path, conflict, storage, and JSON failures.
 * @remarks Filesystem work occurs during execution; the service-aware variant supports caller-supplied storage.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { writeJobWorkerEntriesEffect } from "./worker-entries.js";
 * // entries are accepted manifest worker entries; Node storage is provided by this convenience API.
 * const write = writeJobWorkerEntriesEffect(entries, { buildDirectory: ".relkit/build" });
 * const exit = await Effect.runPromise(Effect.exit(write)); // Includes atomic-write cleanup.
 * ```
 */
export const writeJobWorkerEntriesEffect = Effect.fn("Jobs.writeLocalWorkers")(function* (
  entries: readonly JobsManifestWorkerEntry[],
  options: JobWorkerWriteOptions,
) {
  return yield* writeJobWorkerEntriesWithStorageEffect(entries, options).pipe(
    Effect.provide(JobWorkerStorageLive),
  );
});

/**
 * Writes workers at the legacy Promise edge, preserving original error objects.
 * @param entries - Accepted job bindings.
 * @param options - Filesystem build root.
 * @returns A Promise resolving after writes and cleanup, or rejecting with the original conflict, TypeError, or I/O cause.
 * @see {@link writeJobWorkerEntriesEffect} for composition and execution examples.
 */
export function writeJobWorkerEntries(
  entries: readonly JobsManifestWorkerEntry[],
  options: JobWorkerWriteOptions,
): Promise<JobWorkerWriteReport> {
  return runJobsPromise(
    writeJobWorkerEntriesEffect(entries, options).pipe(
      Effect.mapError((error) =>
        error._tag === "JobWorkerPathError" || error._tag === "JobWorkerStorageError"
          ? error.cause
          : error,
      ),
    ),
  );
}

/**
 * {@inheritDoc writeJobWorkerEntries}
 * @see {@link writeJobWorkerEntriesEffect} for composition and execution examples.
 */
export const writeWorkerEntries = writeJobWorkerEntries;

/**
 * Prepares one immutable worker group without writing bytes.
 * @param path - Full worker path.
 * @param group - Bindings sharing the same build and service generation.
 * @returns A lazy effect yielding rendered artifacts with conflict/storage failures; requires JobWorkerStorage.
 */
const prepareWorkerEffect = Effect.fn("Jobs.prepareWorker")(function* (
  path: string,
  group: readonly JobsManifestWorkerEntry[],
) {
  const sorted = [...group].sort((left, right) => left.jobId.localeCompare(right.jobId));
  const first = sorted[0];
  if (first === undefined) return yield* new JobWorkerConflictError(path);
  const routing = join(dirname(path), "routing.manifest.json");
  const existing = yield* readRoutingManifestEffect(routing);
  const entries = yield* mergeRoutingEntriesEffect(existing, sorted, routing);
  return {
    path,
    content: yield* renderWorkerEffect(first, sorted),
    routing,
    routingContent: yield* renderRoutingEffect(first, entries),
  };
});

/**
 * Checks all immutable worker bytes before allowing writes.
 * @param entries - Fully prepared worker groups.
 * @returns A lazy effect yielding void with conflict/storage failures; requires JobWorkerStorage.
 */
const assertImmutableEffect = Effect.fn("Jobs.assertImmutable")(function* (
  entries: readonly PendingWorker[],
) {
  const storage = yield* JobWorkerStorage;
  for (const entry of entries) {
    const existing = yield* storage.read(entry.path);
    if (existing !== undefined && existing !== entry.content)
      return yield* new JobWorkerConflictError(entry.path);
  }
});
