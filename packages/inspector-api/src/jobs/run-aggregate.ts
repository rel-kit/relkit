import type { JsonValue } from "@relkit/contracts";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import { decodeCursor, encodeCursor, nativeRunFilters, queryFilters, type InspectorCursor, type InspectorRunFilters } from "./filters.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { jobBindings, operationContext } from "./services.js";
import { safeJson, type ResolvedActiveGeneration } from "../shared.js";

interface Checkpoint {
  readonly service: string;
  readonly generation: string;
  readonly cursor?: string;
  readonly consumed: readonly string[];
  readonly blocked?: boolean;
  readonly exhausted?: boolean;
}

export interface AggregatePosition {
  readonly services: readonly Checkpoint[];
}

interface Candidate {
  readonly binding: InspectorJobsBinding;
  readonly run: RunSnapshot;
  readonly key: string;
}

export async function aggregateRuns(
  generation: ResolvedActiveGeneration,
  request: Request,
  filters: InspectorRunFilters,
  cursor: string | null,
): Promise<JsonValue> {
  const bindings = await jobBindings(generation);
  const selected = selectBindings(bindings, filters.service);
  const expected = { kind: "runs" as const, generationId: generation.generationId, graphHash: generation.graphHash, filters: filtersJson(filters) };
  const secret = generation.jobs?.cursorSecret ?? generation.graphHash;
  const position = cursor === null
    ? initialPosition(selected)
    : readPosition(decodeCursor(cursor, expected, secret), selected);
  const states = await readPages(generation, request, filters, selected, position);
  const limit = filters.limit ?? 25;
  const candidates = states.flatMap(({ binding, page, state }) => page === undefined || state.blocked ? [] : page.items
    .filter((run) => !state.consumed.includes(runKey(run, binding)))
    .map((run) => ({ binding, run, key: runKey(run, binding) })));
  candidates.sort(compareCandidates);
  const items = candidates.slice(0, limit);
  const nextPosition = advancePosition(states, items);
  const hasMore = nextPosition.services.some((state) => state.blocked !== true && state.exhausted !== true);
  const availability = states.map(({ binding, page, state, reason }) => ({
    service: binding.service,
    state: page === undefined || state.blocked ? "unavailable" : "available",
    ...(reason === undefined ? {} : { reason }),
  }));
  const safeItems = items.map(({ run, binding }) => {
    const value = safeJson(run);
    return isRecord(value) ? { ...value, service: binding.service, serviceGeneration: binding.serviceGeneration } : value;
  });
  const body: Record<string, unknown> = {
    items: safeItems,
    hasMore,
    partial: states.some(({ state }) => state.blocked === true),
    availability,
  };
  const count = countPages(states);
  if (count !== undefined) body.count = count;
  if (hasMore) body.nextCursor = encodeCursor({ ...expected, position: nextPosition as unknown as JsonValue }, secret);
  const safe = safeJson(body);
  return isRecord(safe) ? { ...safe, items: safeItems, availability } as JsonValue : safe;
}

async function readPages(
  generation: ResolvedActiveGeneration,
  request: Request,
  filters: InspectorRunFilters,
  bindings: readonly InspectorJobsBinding[],
  position: AggregatePosition,
): Promise<readonly { binding: InspectorJobsBinding; page?: RunPage<RunSnapshot>; state: Checkpoint; reason?: string }[]> {
  const states = bindings.map((binding) => ({
    binding,
    state: position.services.find((entry) => entry.service === binding.service) ?? checkpoint(binding),
  }));
  const concurrency = Math.max(1, Math.min(generation.jobs?.maxReadConcurrency ?? 4, states.length || 1));
  return mapLimit(states, concurrency, async ({ binding, state }) => {
    if (state.blocked || state.exhausted) return { binding, state };
    try {
      const page = await binding.list({ ...nativeRunFilters(filters), limit: Math.max(filters.limit ?? 25, 25), ...(state.cursor === undefined ? {} : { cursor: state.cursor }) }, operationContext(generation, binding, "read", request));
      if (page.hasMore && page.nextCursor === undefined)
        throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
      if (page.hasMore && state.cursor !== undefined && page.nextCursor === state.cursor)
        throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
      if (state.consumed.some((key) => !page.items.some((run) => runKey(run, binding) === key)))
        throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
      const unavailable = page.availability.find((entry) => entry.state === "unavailable");
      if (unavailable !== undefined)
        return { binding, page, state: { ...state, blocked: true }, reason: unavailable.reason ?? "native service unavailable" };
      return { binding, page, state };
    } catch (error) {
      if (error instanceof InspectorJobsError) throw error;
      return { binding, state: { ...state, blocked: true }, reason: "native service unavailable" };
    }
  });
}

function advancePosition(
  states: readonly { binding: InspectorJobsBinding; page?: RunPage<RunSnapshot>; state: Checkpoint }[],
  items: readonly Candidate[],
): AggregatePosition {
  const emitted = new Map<string, string[]>();
  for (const item of items) emitted.set(item.binding.service, [...(emitted.get(item.binding.service) ?? []), item.key]);
  return {
    services: states.map(({ binding, state }) => {
      const keys = emitted.get(binding.service) ?? [];
      const consumed = [...state.consumed, ...keys];
      const remaining = states.find((entry) => entry.binding.service === binding.service)?.page?.items
        .some((run) => !consumed.includes(runKey(run, binding))) ?? false;
      const page = states.find((entry) => entry.binding.service === binding.service)?.page;
      if (!remaining) {
        if (page?.hasMore && page.nextCursor !== undefined) return { ...state, cursor: page.nextCursor, consumed: [] };
        if (page !== undefined) return { ...state, consumed: [], exhausted: true };
      }
      return keys.length === 0 ? state : { ...state, consumed };
    }),
  };
}

function selectBindings(bindings: readonly InspectorJobsBinding[], service: string | undefined): readonly InspectorJobsBinding[] {
  const selected = service === undefined ? bindings : bindings.filter((binding) => binding.service === service);
  if (selected.length === 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503, "requested jobs service is unavailable");
  return selected;
}

function checkpoint(binding: InspectorJobsBinding): Checkpoint {
  return { service: binding.service, generation: binding.serviceGeneration, consumed: [] };
}
function initialPosition(bindings: readonly InspectorJobsBinding[]): AggregatePosition {
  return { services: bindings.map(checkpoint) };
}
function readPosition(cursor: InspectorCursor, bindings: readonly InspectorJobsBinding[]): AggregatePosition {
  if (!isRecord(cursor.position) || !Array.isArray(cursor.position.services)) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  const services = cursor.position.services.filter(isRecord).map((value) => {
    if (typeof value.service !== "string" || typeof value.generation !== "string" || !Array.isArray(value.consumed) || value.consumed.some((entry) => typeof entry !== "string")) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
    return {
      service: value.service,
      generation: value.generation,
      ...(typeof value.cursor === "string" ? { cursor: value.cursor } : {}),
      consumed: value.consumed as string[],
      ...(value.blocked === true ? { blocked: true } : {}),
      ...(value.exhausted === true ? { exhausted: true } : {}),
    } satisfies Checkpoint;
  });
  if (services.length !== bindings.length || bindings.some((binding) => services.find((entry) => entry.service === binding.service && entry.generation === binding.serviceGeneration) === undefined)) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return { services };
}

function countPages(states: readonly { page?: RunPage<RunSnapshot>; state: Checkpoint }[]): { value: number; accuracy: "exact" | "approximate" } | undefined {
  if (states.some(({ page, state }) => page === undefined || state.blocked || page.count === undefined)) return undefined;
  const accuracy = states.some(({ page }) => page?.count?.accuracy === "approximate") ? "approximate" : "exact";
  return { value: states.reduce((total, { page }) => total + (page?.count?.value ?? 0), 0), accuracy };
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const accepted = right.run.acceptedAt.localeCompare(left.run.acceptedAt);
  if (accepted !== 0) return accepted;
  const generation = left.binding.serviceGeneration.localeCompare(right.binding.serviceGeneration);
  if (generation !== 0) return generation;
  return left.run.runId.localeCompare(right.run.runId) || left.binding.service.localeCompare(right.binding.service);
}
function runKey(run: RunSnapshot, binding: InspectorJobsBinding): string { return `${run.acceptedAt}\0${binding.serviceGeneration}\0${run.runId}`; }
function filtersJson(filters: InspectorRunFilters): JsonValue { return queryFilters(filters); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

async function mapLimit<T, R>(values: readonly T[], limit: number, callback: (value: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    const index = next++;
    if (index >= values.length) return;
    result[index] = await callback(values[index]!);
    await worker();
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return result;
}
