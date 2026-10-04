import type { RuntimeCollection } from "./runtime.types.js";
import type { JsonValue } from "@relkit/contracts";
import { runtimeItemId } from "./runtime-item.js";
import { isRecord, pick, safeJson, safeSource, type ResolvedActiveGeneration } from "./shared.js";

export const RUNTIME_FIELDS = [
  "id",
  "functionId",
  "jobId",
  "instanceId",
  "eventId",
  "eventVersion",
  "deliveryId",
  "bucketId",
  "cacheId",
  "toolId",
  "agentId",
  "turnId",
  "profile",
  "status",
  "state",
  "outcome",
  "approval",
  "sideEffect",
  "invocationId",
  "requestId",
  "traceId",
  "triggerId",
  "toolCallId",
  "parentSpanId",
  "step",
  "attempt",
  "acceptedAt",
  "availableAt",
  "leaseExpiresAt",
  "idempotencyExpiresAt",
  "nextRun",
  "nextRunAt",
  "nextFireAt",
  "schedules",
  "startedAt",
  "completedAt",
  "durationMs",
  "timeoutMs",
  "concurrency",
  "declaredEdges",
  "observedEdges",
  "failure",
  "errorId",
  "occurredAt",
  "capabilities",
  "policy",
  "schemaVersion",
  "bytes",
  "objects",
  "entries",
  "hits",
  "misses",
  "evictions",
  "inFlight",
  "inputBytes",
  "outputBytes",
];

/**
 * Selects the native authority for one declared runtime collection.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @returns The existing authority, including the cache compatibility alias.
 */
export function runtimeSource(
  generation: ResolvedActiveGeneration,
  collection: RuntimeCollection,
): unknown {
  if (collection === "cache") return generation.runtime?.cache ?? generation.runtime?.caches;
  return generation.runtime?.[collection];
}

/**
 * Selects runtime identity, timestamps and declared state fields before redaction.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public runtime evidence or undefined for an invalid record.
 */
export function projectItem(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  const result = pick(value, RUNTIME_FIELDS);
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  const id = runtimeItemId(value);
  if (id !== undefined) result.id = id;
  return safeJson(result);
}
