import type { JsonValue } from "@relkit/contracts";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import {
  decodeCursor,
  encodeCursor,
  nativeRunFilters,
  type InspectorRunFilters,
} from "./filters.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { jobBindings, operationContext } from "./services.js";
import { safeJson, type ResolvedActiveGeneration } from "../shared.js";
import {
  advancePosition,
  checkpoint,
  compareCandidates,
  countPages,
  filtersJson,
  initialPosition,
  isRecord,
  mapLimit,
  readPosition,
  runKey,
  selectBindings,
  type AggregatePosition,
  type Checkpoint,
} from "./run-aggregate-support.js";

export type { AggregatePosition } from "./run-aggregate-support.js";

export async function aggregateRuns(
  generation: ResolvedActiveGeneration,
  request: Request,
  filters: InspectorRunFilters,
  cursor: string | null,
): Promise<JsonValue> {
  const bindings = await jobBindings(generation);
  const selected = selectBindings(bindings, filters.service);
  const expected = {
    kind: "runs" as const,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
    filters: filtersJson(filters),
  };
  const secret = generation.jobs?.cursorSecret ?? generation.graphHash;
  const position =
    cursor === null
      ? initialPosition(selected)
      : readPosition(decodeCursor(cursor, expected, secret), selected);
  const states = await readPages(generation, request, filters, selected, position);
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
    body.nextCursor = encodeCursor(
      { ...expected, position: nextPosition as unknown as JsonValue },
      secret,
    );
  const safe = safeJson(body);
  return isRecord(safe) ? ({ ...safe, items: safeItems, availability } as JsonValue) : safe;
}

async function readPages(
  generation: ResolvedActiveGeneration,
  request: Request,
  filters: InspectorRunFilters,
  bindings: readonly InspectorJobsBinding[],
  position: AggregatePosition,
): Promise<
  readonly {
    binding: InspectorJobsBinding;
    page?: RunPage<RunSnapshot>;
    state: Checkpoint;
    reason?: string;
  }[]
> {
  const states = bindings.map((binding) => ({
    binding,
    state:
      position.services.find((entry) => entry.service === binding.service) ?? checkpoint(binding),
  }));
  const concurrency = Math.max(
    1,
    Math.min(generation.jobs?.maxReadConcurrency ?? 4, states.length || 1),
  );
  return mapLimit(states, concurrency, async ({ binding, state }) => {
    if (state.blocked || state.exhausted) return { binding, state };
    try {
      const page = await binding.list(
        {
          ...nativeRunFilters(filters),
          limit: Math.max(filters.limit ?? 25, 25),
          ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
        },
        operationContext(generation, binding, "read", request),
      );
      if (page.hasMore && page.nextCursor === undefined)
        throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
      if (page.hasMore && state.cursor !== undefined && page.nextCursor === state.cursor)
        throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
      if (state.consumed.some((key) => !page.items.some((run) => runKey(run, binding) === key)))
        throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
      const unavailable = page.availability.find((entry) => entry.state === "unavailable");
      if (unavailable !== undefined)
        return {
          binding,
          page,
          state: { ...state, blocked: true },
          reason: unavailable.reason ?? "native service unavailable",
        };
      return { binding, page, state };
    } catch (error) {
      if (error instanceof InspectorJobsError) throw error;
      return { binding, state: { ...state, blocked: true }, reason: "native service unavailable" };
    }
  });
}
