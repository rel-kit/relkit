import type { JsonValue } from "@relkit/contracts";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import { queryFilters, type InspectorCursor, type InspectorRunFilters } from "./filters.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";

export interface Checkpoint {
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

export interface Candidate {
  readonly binding: InspectorJobsBinding;
  readonly run: RunSnapshot;
  readonly key: string;
}

export function advancePosition(
  states: readonly {
    binding: InspectorJobsBinding;
    page?: RunPage<RunSnapshot>;
    state: Checkpoint;
  }[],
  items: readonly Candidate[],
): AggregatePosition {
  const emitted = new Map<string, string[]>();
  for (const item of items)
    emitted.set(item.binding.service, [...(emitted.get(item.binding.service) ?? []), item.key]);
  return {
    services: states.map(({ binding, state }) => {
      const keys = emitted.get(binding.service) ?? [];
      const consumed = [...state.consumed, ...keys];
      const remaining =
        states
          .find((entry) => entry.binding.service === binding.service)
          ?.page?.items.some((run) => !consumed.includes(runKey(run, binding))) ?? false;
      const page = states.find((entry) => entry.binding.service === binding.service)?.page;
      if (!remaining) {
        if (page?.hasMore && page.nextCursor !== undefined)
          return { ...state, cursor: page.nextCursor, consumed: [] };
        if (page !== undefined) return { ...state, consumed: [], exhausted: true };
      }
      return keys.length === 0 ? state : { ...state, consumed };
    }),
  };
}

export function selectBindings(
  bindings: readonly InspectorJobsBinding[],
  service: string | undefined,
): readonly InspectorJobsBinding[] {
  const selected =
    service === undefined ? bindings : bindings.filter((binding) => binding.service === service);
  if (selected.length === 0)
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_UNAVAILABLE",
      503,
      "requested jobs service is unavailable",
    );
  return selected;
}

export function checkpoint(binding: InspectorJobsBinding): Checkpoint {
  return { service: binding.service, generation: binding.serviceGeneration, consumed: [] };
}

export function initialPosition(bindings: readonly InspectorJobsBinding[]): AggregatePosition {
  return { services: bindings.map(checkpoint) };
}

export function readPosition(
  cursor: InspectorCursor,
  bindings: readonly InspectorJobsBinding[],
): AggregatePosition {
  if (!isRecord(cursor.position) || !Array.isArray(cursor.position.services))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  const services = cursor.position.services.filter(isRecord).map((value) => {
    if (
      typeof value.service !== "string" ||
      typeof value.generation !== "string" ||
      !Array.isArray(value.consumed) ||
      value.consumed.some((entry) => typeof entry !== "string")
    )
      throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
    return {
      service: value.service,
      generation: value.generation,
      ...(typeof value.cursor === "string" ? { cursor: value.cursor } : {}),
      consumed: value.consumed as string[],
      ...(value.blocked === true ? { blocked: true } : {}),
      ...(value.exhausted === true ? { exhausted: true } : {}),
    } satisfies Checkpoint;
  });
  if (
    services.length !== bindings.length ||
    bindings.some(
      (binding) =>
        services.find(
          (entry) =>
            entry.service === binding.service && entry.generation === binding.serviceGeneration,
        ) === undefined,
    )
  )
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return { services };
}

export function countPages(
  states: readonly { page?: RunPage<RunSnapshot>; state: Checkpoint }[],
): { value: number; accuracy: "exact" | "approximate" } | undefined {
  if (
    states.some(
      ({ page, state }) => page === undefined || state.blocked || page.count === undefined,
    )
  )
    return undefined;
  const accuracy = states.some(({ page }) => page?.count?.accuracy === "approximate")
    ? "approximate"
    : "exact";
  return {
    value: states.reduce((total, { page }) => total + (page?.count?.value ?? 0), 0),
    accuracy,
  };
}

export function compareCandidates(left: Candidate, right: Candidate): number {
  const accepted = right.run.acceptedAt.localeCompare(left.run.acceptedAt);
  if (accepted !== 0) return accepted;
  const generation = left.binding.serviceGeneration.localeCompare(right.binding.serviceGeneration);
  if (generation !== 0) return generation;
  return (
    left.run.runId.localeCompare(right.run.runId) ||
    left.binding.service.localeCompare(right.binding.service)
  );
}

export function runKey(run: RunSnapshot, binding: InspectorJobsBinding): string {
  return `${run.acceptedAt}\0${binding.serviceGeneration}\0${run.runId}`;
}

export function filtersJson(filters: InspectorRunFilters): JsonValue {
  return queryFilters(filters);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  callback: (value: T) => Promise<R>,
): Promise<R[]> {
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
