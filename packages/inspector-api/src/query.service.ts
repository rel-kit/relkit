import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type { JsonValue } from "@relkit/contracts";
import { resolveActiveGenerationEffect } from "./generation.js";
import { negotiate } from "./router-utils.js";
import {
  graphDetailEffect,
  graphListEffect,
  graphSnapshotEffect,
  sourceDetailEffect,
} from "./graph.js";
import { runtimeDetailEffect, runtimeListEffect, runtimeSnapshotEffect } from "./runtime.js";
import { diagnosticsEffect } from "./diagnostics.js";
import { environmentMetadataEffect } from "./environment.js";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
import {
  bucketObjectsEffect,
  bucketPreviewEffect,
  cacheKeysEffect,
  cacheValueEffect,
} from "./resource-explorer.js";
import type { ResolvedActiveGeneration } from "./shared.js";
import { InspectorNativeJobs } from "./jobs/native.service.js";
import type {
  InspectorAccess,
  InspectorProjection,
  InspectorQueryDependencies,
  InspectorQueryService,
} from "./query.types.js";
import type { InspectorQueryFailure } from "./native-edge.types.js";

/** Authorized generation access and selective projection under one query owner. */
export class InspectorQueries extends Context.Service<InspectorQueries, InspectorQueryService>()(
  "@relkit/inspector/Queries",
) {}

/**
 * Acquires query authorities once, keeping authorization ahead of generation access.
 * @param dependencies - Native generation and authorization authorities.
 * @returns A live query layer; operations fail with their original public errors.
 * @remarks Projection selects known graph/runtime fields before redaction. Schema
 * decoding of an entire generation would evaluate private or poisoned getters.
 * @example
 * ```ts
 * import { Effect, Layer, ManagedRuntime } from "effect";
 * import { InspectorQueries, inspectorQueriesLayer, inspectorNativeJobsLayer } from "@relkit/inspector-api";
 * const runtime = ManagedRuntime.make(inspectorQueriesLayer({ authorize: () => true }).pipe(
 *   Layer.provide(inspectorNativeJobsLayer)));
 * try {
 *   await runtime.runPromise(Effect.flatMap(InspectorQueries, (queries) =>
 *     queries.access(new Request("http://localhost"), false)));
 * } finally { await runtime.dispose(); }
 * ```
 */
export function inspectorQueriesLayer(dependencies: InspectorQueryDependencies) {
  return Layer.effect(
    InspectorQueries,
    Effect.gen(function* () {
      const native = yield* InspectorNativeJobs;
      const access = Effect.fn("InspectorQueries.access")(
        function* (request: Request, includeGeneration: boolean) {
          const allowed = yield* nativeAttempt(() => dependencies.authorize(request));
          if (!allowed) return { allowed: false } satisfies InspectorAccess;
          yield* projectionAttempt(() => negotiate(request));
          const generation = includeGeneration
            ? yield* resolveActiveGenerationEffect(dependencies)
            : undefined;
          return { allowed: true, generation } satisfies InspectorAccess;
        },
        (effect) => observeExecution("inspector", "query.access", effect),
      );
      const project = Effect.fn("InspectorQueries.project")(
        (generation: ResolvedActiveGeneration, projection: InspectorProjection) =>
          projectValue(generation, projection).pipe(
            Effect.provideService(InspectorNativeJobs, native),
          ),
        (effect) =>
          observeExecution("inspector", "query.project", effect, () => ({ projections: 1 })),
      );
      return InspectorQueries.of({ access, project });
    }),
  );
}

/**
 * Projects only the fields owned by a declared query kind.
 * @param generation - Authorized resolved generation.
 * @param projection - Validated declaration selecting the projection.
 * @returns Public redacted JSON preserving existing cursor and error behavior.
 */
function projectValue(
  generation: ResolvedActiveGeneration,
  projection: InspectorProjection,
): Effect.Effect<JsonValue, InspectorQueryFailure, InspectorNativeJobs> {
  switch (projection.kind) {
    case "graph":
      return graphSnapshotEffect(generation);
    case "runtime":
      return runtimeSnapshotEffect(generation);
    case "environment":
      return environmentMetadataEffect(generation, projection.request);
    case "diagnostics":
      return diagnosticsEffect(generation, projection.request);
    case "source":
      return sourceDetailEffect(generation, projection.id);
    case "graph-list":
      return graphListEffect(generation, projection.collection, projection.request);
    case "graph-detail":
      return graphDetailEffect(generation, projection.collection, projection.id);
    case "runtime-list":
      return runtimeListEffect(generation, projection.collection, projection.request);
    case "runtime-detail":
      return runtimeDetailEffect(generation, projection.collection, projection.id);
    case "bucket-objects":
      return bucketObjectsEffect(generation, projection.id, projection.request);
    case "bucket-preview":
      return bucketPreviewEffect(
        generation,
        projection.id,
        projection.request,
        projection.maximumBytes,
      );
    case "cache-keys":
      return cacheKeysEffect(generation, projection.id, projection.request);
    case "cache-value":
      return cacheValueEffect(
        generation,
        projection.id,
        projection.request,
        projection.maximumBytes,
      );
  }
}
