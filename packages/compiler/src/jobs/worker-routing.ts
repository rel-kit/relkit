import { observeJobs } from "./observability.js";
import { serializeJsonEffect } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import type { JobsManifestWorkerEntry } from "./manifest.types.js";
import { JobWorkerConflictError } from "./worker-errors.js";
import { RoutingManifestSchema } from "./worker-entries-support.js";
import type { RoutingEntry, RoutingManifest } from "./worker-entries-support.types.js";
import { JobWorkerStorage } from "./worker-storage.js";

/**
 * Reads and validates historical routing before it participates in immutable comparisons.
 * @param path - Routing manifest path.
 * @returns A lazy effect yielding the decoded manifest or undefined; failures are storage or conflict errors.
 * @remarks Requires JobWorkerStorage. Excess fields are preserved because they participate in conflict identity.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { JobWorkerStorageLive } from "./worker-storage.js";
 * import { readRoutingManifestEffect } from "./worker-routing.js";
 * const read = readRoutingManifestEffect(".relkit/build/jobs/build/v1/routing.manifest.json")
 *   .pipe(Effect.provide(JobWorkerStorageLive));
 * const exit = await Effect.runPromise(Effect.exit(read));
 * ```
 */
export const readRoutingManifestEffect = Effect.fn("Jobs.readRoutingManifest")(
  function* (path: string) {
    const storage = yield* JobWorkerStorage;
    const source = yield* storage.read(path);
    if (source === undefined) return undefined;
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RoutingManifestSchema))(
      source,
    ).pipe(Effect.mapError(() => new JobWorkerConflictError(path)));
  },
  (effect, path) => observeJobs("routingRead", effect, () => ({ routingManifests: 1 })),
);

/**
 * Renders canonical immutable worker metadata for one build group.
 * @param first - Representative binding for the shared build and service generation.
 * @param entries - Bindings or historical routing identities in deterministic order.
 * @returns A lazy effect yielding canonical worker JSON followed by one newline.
 */
export const renderWorkerEffect = Effect.fn("Jobs.renderWorker")(
  function* (first: JobsManifestWorkerEntry, entries: readonly JobsManifestWorkerEntry[]) {
    return `${yield* serializeJsonEffect({
      kind: "relkit-job-worker",
      version: 1,
      buildId: first.buildId,
      serviceGeneration: first.serviceGeneration,
      taskIds: [...new Set(entries.map((entry) => entry.taskId))].sort(),
    })}\n`;
  },
  (effect, first, entries) =>
    observeJobs(
      "renderWorker",
      effect,
      () => ({
        workers: 1,
        tasks: new Set(entries.map((entry) => entry.taskId)).size,
      }),
      (content) => ({ bytes: new TextEncoder().encode(content).byteLength }),
    ),
);

/**
 * Renders canonical historical routing identities for one build group.
 * @param first - Representative binding for the shared build and service generation.
 * @param entries - Bindings or historical routing identities in deterministic order.
 * @returns A lazy effect yielding canonical routing JSON followed by one newline.
 */
export const renderRoutingEffect = Effect.fn("Jobs.renderRouting")(
  function* (first: JobsManifestWorkerEntry, entries: readonly RoutingEntry[]) {
    return `${yield* serializeJsonEffect({
      protocol: "relkit.jobs-routing",
      version: 1,
      buildId: first.buildId,
      serviceGeneration: first.serviceGeneration,
      entries: entries.map(({ jobId, taskId, buildId, serviceGeneration }) => ({
        jobId,
        taskId,
        buildId,
        serviceGeneration,
      })),
    })}\n`;
  },
  (effect, first, entries) =>
    observeJobs(
      "renderRouting",
      effect,
      () => ({ routingManifests: 1, jobs: entries.length }),
      (content) => ({ bytes: new TextEncoder().encode(content).byteLength }),
    ),
);

/**
 * Merges accepted bindings with historical routing while rejecting identity changes.
 * @param existing - Decoded historical routing, or undefined for a new worker.
 * @param incoming - Accepted bindings sharing an immutable worker identity.
 * @param path - Filesystem path used to report immutable routing conflicts.
 * @returns A lazy effect yielding the sorted merged routing entries.
 * @remarks Fails with JobWorkerConflictError when a build, generation, or historical identity conflicts.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { mergeRoutingEntriesEffect } from "./worker-routing.js";
 * // entries are accepted manifest worker entries; undefined means no historical routing exists.
 * const merge = mergeRoutingEntriesEffect(undefined, entries, "routing.manifest.json");
 * const exit = Effect.runSync(Effect.exit(merge));
 * ```
 */
export const mergeRoutingEntriesEffect = Effect.fn("Jobs.mergeRoutingEntries")(
  function* (
    existing: RoutingManifest | undefined,
    incoming: readonly JobsManifestWorkerEntry[],
    path: string,
  ) {
    const first = incoming[0];
    if (first === undefined) return existing?.entries ?? [];
    if (
      existing !== undefined &&
      (existing.buildId !== first.buildId || existing.serviceGeneration !== first.serviceGeneration)
    ) {
      return yield* new JobWorkerConflictError(path);
    }
    const entries = new Map(existing?.entries.map((entry) => [entry.jobId, entry]) ?? []);
    for (const entry of incoming) {
      const next = routingEntry(entry);
      const previous = entries.get(next.jobId);
      if (
        previous !== undefined &&
        (yield* serializeJsonEffect(previous)) !== (yield* serializeJsonEffect(next))
      )
        return yield* new JobWorkerConflictError(path);
      entries.set(next.jobId, next);
    }
    return [...entries.values()].sort((left, right) => left.jobId.localeCompare(right.jobId));
  },
  (effect, existing, incoming, path) =>
    observeJobs("routingMerge", effect, () => ({ jobs: incoming.length })),
);

/**
 * Projects a binding's immutable routing identity.
 * @param entry - Accepted binding whose immutable routing fields are selected.
 * @returns the four-field routing identity.
 */
function routingEntry(entry: JobsManifestWorkerEntry): RoutingEntry {
  const { jobId, taskId, buildId, serviceGeneration } = entry;
  return { jobId, taskId, buildId, serviceGeneration };
}
