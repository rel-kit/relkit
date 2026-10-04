import type {
  Checkpoint,
  AggregatePosition,
  AggregateCount,
  AggregateCountPage,
  Candidate,
} from "./run-aggregate-support.types.js";
export type { Checkpoint, AggregatePosition, Candidate } from "./run-aggregate-support.types.js";
import type { JsonValue } from "@relkit/contracts";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeRunPage } from "./native.types.js";
import { queryFilters, type InspectorCursor, type InspectorRunFilters } from "./filters.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";

/**
 * Advances aggregate checkpoints only for rows consumed by the public page.
 * @param states - Ordered native page results and retained checkpoints.
 * @param items - Ordered public records to filter and paginate.
 * @returns Retained per-service cursor, consumed-row and availability evidence.
 */
export function advancePosition(
  states: readonly NativeRunPage[],
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

/**
 * Selects declared native services and rejects an unavailable explicit selector.
 * @param bindings - Native job authorities in declaration order.
 * @param service - Optional service selector; ambiguous selections are rejected.
 * @returns Native authorities in declaration order.
 */
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

/**
 * Creates the initial aggregate checkpoint for one native service generation.
 * @param binding - Selected native job authority and its service identity.
 * @returns An unconsumed service checkpoint.
 */
export function checkpoint(binding: InspectorJobsBinding): Checkpoint {
  return { service: binding.service, generation: binding.serviceGeneration, consumed: [] };
}

/**
 * Creates aggregate checkpoints in native service declaration order.
 * @param bindings - Native job authorities in declaration order.
 * @returns The initial authoritative aggregate position.
 */
export function initialPosition(bindings: readonly InspectorJobsBinding[]): AggregatePosition {
  return { services: bindings.map(checkpoint) };
}

/**
 * Validates the decoded continuation position before using it.
 * @param cursor - Signed continuation cursor, or null for the initial page.
 * @param bindings - Native job authorities in declaration order.
 * @returns An accepted continuation position or the existing cursor failure.
 */
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

/**
 * Combines count evidence only when every native page is available and provides a count.
 * @param states - Ordered native page results and retained checkpoints.
 * @returns Combined count and its weakest accuracy, or undefined when incomplete.
 */
export function countPages(states: readonly AggregateCountPage[]): AggregateCount | undefined {
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

/**
 * Orders native runs using accepted timestamps and stable public service/run identities.
 * @param left - First projected value in the stable ordering.
 * @param right - Second projected value in the stable ordering.
 * @returns The deterministic merge comparison result.
 */
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

/**
 * Combines service-generation and native run identity for consumed-row tracking.
 * @param run - Native run identity used for stable aggregate ordering.
 * @param binding - Selected native job authority and its service identity.
 * @returns A stable private aggregate row key.
 */
export function runKey(run: RunSnapshot, binding: InspectorJobsBinding): string {
  return `${run.acceptedAt}\0${binding.serviceGeneration}\0${run.runId}`;
}

/**
 * Projects present filter fields into the signed cursor identity.
 * @param filters - Validated filters bound into the continuation cursor.
 * @returns Canonical JSON-compatible filter fields.
 */
export function filtersJson(filters: InspectorRunFilters): JsonValue {
  return queryFilters(filters);
}

/**
 * Checks the existing non-null non-array record boundary.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Whether the value can be selectively projected as a record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
