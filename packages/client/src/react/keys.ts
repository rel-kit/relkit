import type { RelkitKeyScope, RelkitJobKeyOptions } from "./keys.types.js";
export type { RelkitKeyScope, RelkitJobKeyOptions } from "./keys.types.js";

/**
 * Constructs the canonical scope-complete finite query or mutation key.
 * @param scope - Complete identity scope.
 * @param kind - Existing operation or event kind.
 * @param procedureId - Existing procedure id supplied by the owning operation.
 * @param input - Exact transmitted request input.
 * @returns The canonical scope-complete finite operation key.
 */
export function relkitKey(
  scope: RelkitKeyScope,
  kind: "query" | "mutation" | "stream" | "agent" | "channel",
  procedureId: string,
  input?: unknown,
): readonly unknown[] {
  return [
    "relkit",
    scope.backend,
    scope.applicationId,
    scope.identityScope,
    scope.sessionEpoch,
    scope.identityKey ?? "",
    scope.publicFingerprint,
    scope.environment ?? "",
    scope.jobsProtocolVersion ?? 1,
    kind,
    procedureId,
    canonical(input),
  ] as const;
}

/**
 * Constructs the canonical scope-complete job observation or mutation key.
 * @param scope - Complete identity scope.
 * @param operation - One native boundary operation.
 * @param options - Existing public configuration and authority.
 * @param input - Exact transmitted request input.
 * @returns The canonical scope-complete job operation key.
 */
export function relkitJobKey(
  scope: RelkitKeyScope,
  operation: "trigger" | "run" | "cancel" | "retry",
  options: RelkitJobKeyOptions,
  input?: unknown,
): readonly unknown[] {
  return [
    "relkit",
    "job",
    scope.backend,
    scope.applicationId,
    options.environment ?? scope.environment ?? "",
    scope.identityScope,
    scope.sessionEpoch,
    scope.identityKey ?? "",
    scope.publicFingerprint,
    options.jobsProtocolVersion ?? scope.jobsProtocolVersion ?? 1,
    options.jobId,
    options.runId ?? "",
    options.projection ?? "",
    options.schemaVersion ?? "",
    operation,
    canonical(input),
  ] as const;
}

/**
 * Normalizes nested object key order while retaining array order and scalar values.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The value with object keys sorted and array order preserved.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
}
