import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { InspectorNativeJobs, inspectorNativeJobsExecution } from "./native.service.js";
import { nativeAttempt, projectionAttempt } from "../native-edge.js";
import { decodeCursor, encodeCursor, type InspectorRunFilters } from "./filters.js";
import { jobBindings } from "./services.js";
import { safeJson, type ResolvedActiveGeneration } from "../shared.js";
import {
  advancePosition,
  compareCandidates,
  countPages,
  filtersJson,
  initialPosition,
  isRecord,
  readPosition,
  runKey,
  selectBindings,
} from "./run-aggregate-support.js";

export type { AggregatePosition } from "./run-aggregate-support.js";

/**
 * Aggregates native runs on the reused compatibility owner.
 * @param generation - Authorized active generation.
 * @param request - HTTP request and cancellation signal.
 * @param filters - Validated run filters.
 * @param cursor - Signed continuation cursor, or null for the first page.
 * @returns A stable ordered page with truthful partial/count evidence.
 */
export function aggregateRuns(
  generation: ResolvedActiveGeneration,
  request: Request,
  filters: InspectorRunFilters,
  cursor: string | null,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorNativeJobsExecution,
    aggregateRunsEffect(generation, request, filters, cursor),
  );
}

/**
 * Lazily merges bounded native pages while retaining unconsumed rows in the cursor.
 * @param generation - Authorized active generation.
 * @param request - HTTP request whose signal is passed to native methods.
 * @param filters - Validated filters bound into the signed cursor.
 * @param cursor - Signed continuation cursor, or null for the first page.
 * @returns Public JSON requiring InspectorNativeJobs; native cursor failures remain fatal.
 */
export const aggregateRunsEffect = Effect.fn("InspectorJobs.aggregateRuns")(
  function* (
    generation: ResolvedActiveGeneration,
    request: Request,
    filters: InspectorRunFilters,
    cursor: string | null,
  ) {
    const bindings = yield* nativeAttempt(() => jobBindings(generation));
    const selected = yield* projectionAttempt(() => selectBindings(bindings, filters.service));
    const expected = {
      kind: "runs" as const,
      generationId: generation.generationId,
      graphHash: generation.graphHash,
      filters: filtersJson(filters),
    };
    const secret = generation.jobs?.cursorSecret ?? generation.graphHash;
    const position = yield* projectionAttempt(() =>
      cursor === null
        ? initialPosition(selected)
        : readPosition(decodeCursor(cursor, expected, secret), selected),
    );
    const native = yield* InspectorNativeJobs;
    const states = yield* native.runPages(generation, request, filters, selected, position);
    const limit = filters.limit ?? 25;
    const candidates = states.flatMap(({ binding, page, state }) =>
      page === undefined || state.blocked
        ? []
        : page.items
            .filter((run) => !state.consumed.includes(runKey(run, binding)))
            .map((run) => ({ binding, run, key: runKey(run, binding) })),
    );
    candidates.sort(compareCandidates);
    const items = candidates.slice(0, limit);
    const nextPosition = advancePosition(states, items);
    const hasMore = nextPosition.services.some(
      (state) => state.blocked !== true && state.exhausted !== true,
    );
    const availability = states.map(({ binding, page, state, reason }) => ({
      service: binding.service,
      state: page === undefined || state.blocked ? "unavailable" : "available",
      ...(reason === undefined ? {} : { reason }),
    }));
    const safeItems = items.map(({ run, binding }) => {
      const value = safeJson(run);
      return isRecord(value)
        ? { ...value, service: binding.service, serviceGeneration: binding.serviceGeneration }
        : value;
    });
    const body: Record<string, unknown> = {
      items: safeItems,
      hasMore,
      partial: states.some(({ state }) => state.blocked === true),
      availability,
    };
    const count = countPages(states);
    if (count !== undefined) body.count = count;
    if (hasMore)
      body.nextCursor = yield* projectionAttempt(() =>
        encodeCursor({ ...expected, position: nextPosition as unknown as JsonValue }, secret),
      );
    const safe = safeJson(body);
    return isRecord(safe) ? ({ ...safe, items: safeItems, availability } as JsonValue) : safe;
  },
  (effect) => observeExecution("inspector", "jobs.aggregate", effect),
);
