import type { RuntimeCollection } from "./runtime.types.js";
export type { RuntimeCollection } from "./runtime.types.js";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { inspectorNativeJobsExecution as inspectorExecution } from "./jobs/native.service.js";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
import type { JsonValue } from "@relkit/contracts";
import { eventRuntimeListEffect } from "./events-runtime.js";
import { getJobRunEffect, listJobRunsEffect } from "./jobs/runs.js";
import { runtimeJobSummaryEffect } from "./jobs/runtime-summary.js";
import { projectRuntimeMetadata } from "./runtime-metadata.js";
import { runtimeItemId } from "./runtime-item.js";
import {
  identity,
  isRecord,
  page,
  resolveCollection,
  resolveItem,
  type ResolvedActiveGeneration,
} from "./shared.js";

/** Declared native runtime collection vocabulary, traversed with finite concurrency. */
export const RUNTIME_COLLECTIONS = Object.freeze([
  "functions",
  "jobs",
  "events",
  "buckets",
  "cache",
  "tools",
  "agents",
] as const);

/** Native runtime availability/detail failure with the existing public status envelope. */
export class InspectorRuntimeError extends Schema.TaggedError<InspectorRuntimeError>()(
  "InspectorRuntimeError",
  {
    code: Schema.Literals(["RELKIT_INSPECTOR_RUNTIME_UNAVAILABLE", "RELKIT_INSPECTOR_NOT_FOUND"]),
    status: Schema.Literals([404, 503]),
    message: Schema.String,
  },
) {
  constructor(
    code: "RELKIT_INSPECTOR_RUNTIME_UNAVAILABLE" | "RELKIT_INSPECTOR_NOT_FOUND",
    status: 404 | 503,
  ) {
    super({ code, status, message: code });
    this.name = "InspectorRuntimeError";
  }
}

/**
 * Reads declared runtime collections with finite ordered concurrency.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns A lazy observed Effect containing the existing runtime snapshot and public metadata.
 */
export const runtimeSnapshotEffect = Effect.fn("Inspector.runtimeSnapshot")(
  function* (generation: ResolvedActiveGeneration) {
    const entries = yield* Effect.forEach(
      RUNTIME_COLLECTIONS,
      (collection) =>
        Effect.gen(function* () {
          if (collection === "jobs" && generation.jobs !== undefined)
            return [collection, yield* runtimeJobSummaryEffect(generation)] as const;
          const items = yield* runtimeItemsEffect(generation, collection);
          return [collection, { count: items.length, items }] as const;
        }),
      { concurrency: 4 },
    );
    return {
      ...identity(generation),
      state: Object.fromEntries(entries),
      ...projectRuntimeMetadata(generation),
    } as JsonValue;
  },
  (effect) => observeExecution("inspector", "runtimeSnapshot", effect),
);

/**
 * Reads declared runtime collections with finite ordered concurrency.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns The existing runtime snapshot and public metadata.
 */
export function runtimeSnapshot(generation: ResolvedActiveGeneration): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, runtimeSnapshotEffect(generation));
}

/**
 * Lists and paginates the selected native runtime collection.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A lazy observed Effect containing a bounded public runtime page.
 */
export const runtimeListEffect = Effect.fn("Inspector.runtimeList")(
  function* (
    generation: ResolvedActiveGeneration,
    collection: RuntimeCollection,
    request: Request,
  ) {
    if (collection === "events") return yield* eventRuntimeListEffect(generation, request);
    if (collection === "jobs" && generation.jobs !== undefined)
      return yield* listJobRunsEffect(generation, request);
    const items = yield* runtimeItemsEffect(generation, collection);
    return yield* projectionAttempt(
      () => ({ ...identity(generation), ...page(items, request) }) as JsonValue,
    );
  },
  (effect) => observeExecution("inspector", "runtimeList", effect),
);

/**
 * Lists and paginates the selected native runtime collection.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A bounded public runtime page.
 */
export function runtimeList(
  generation: ResolvedActiveGeneration,
  collection: RuntimeCollection,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorExecution,
    runtimeListEffect(generation, collection, request),
  );
}

/**
 * Resolves one native runtime record and projects only public evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns A lazy observed Effect containing the existing public runtime-detail envelope or not-found failure.
 */
export const runtimeDetailEffect = Effect.fn("Inspector.runtimeDetail")(
  function* (generation: ResolvedActiveGeneration, collection: RuntimeCollection, id: string) {
    if (collection === "jobs" && generation.jobs !== undefined)
      return yield* getJobRunEffect(
        generation,
        new Request(`http://inspector${requestPath(generation, id)}`),
        id,
      );
    const source = runtimeSource(generation, collection);
    let item = yield* nativeAttempt(() => resolveItem(source, id));
    if (item === undefined)
      item = (yield* runtimeItemsEffect(generation, collection)).find(
        (value) => runtimeItemId(value) === id,
      );
    if (item === undefined)
      return yield* Effect.fail(new InspectorRuntimeError("RELKIT_INSPECTOR_NOT_FOUND", 404));
    return { ...identity(generation), state: projectItem(item) } as JsonValue;
  },
  (effect) => observeExecution("inspector", "runtimeDetail", effect),
);

/**
 * Resolves one native runtime record and projects only public evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing public runtime-detail envelope or not-found failure.
 */
export function runtimeDetail(
  generation: ResolvedActiveGeneration,
  collection: RuntimeCollection,
  id: string,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, runtimeDetailEffect(generation, collection, id));
}

/**
 * Constructs the existing native jobs detail path for a run identifier.
 * @param _generation - Existing compatibility generation parameter; path identity comes from the encoded run ID.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns An encoded jobs detail path.
 */
function requestPath(_generation: ResolvedActiveGeneration, id: string): string {
  return `/_relkit/v1/jobs/runs/${encodeURIComponent(id)}`;
}

/**
 * Resolves one native runtime collection and projects records individually.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @returns A lazy observed Effect containing public records in native source order.
 */
const runtimeItemsEffect = Effect.fn("Inspector.runtimeItems")(
  function* (generation: ResolvedActiveGeneration, collection: RuntimeCollection) {
    const source = runtimeSource(generation, collection);
    if (source === undefined) return [];
    const value = yield* nativeAttempt(() => resolveCollection(source));
    if (value === undefined || value === null) return [];
    const raw = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.items)
        ? value.items
        : isRecord(value)
          ? [value]
          : [];
    return raw.flatMap((item) => {
      const projected = projectItem(item);
      return projected === undefined ? [] : [projected];
    });
  },
  (effect) => observeExecution("inspector", "runtimeItems", effect),
);

import { runtimeSource, projectItem } from "./runtime-projection.js";
