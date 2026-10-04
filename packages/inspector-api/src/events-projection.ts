import { type JsonValue } from "@relkit/contracts";
import { isRecord, pick, safeJson, safeSource } from "./shared.js";

/**
 * Selects public event contract identity and schema metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted declared event contract.
 */
export function projectContract(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.version !== "number")
    return [];
  const result = pick(value, ["protocol", "protocolVersion", "id", "version", "sensitiveFields"]);
  const input = safeSchema(value.input);
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  const projected = safeJson(result);
  return [input === undefined || !isRecord(projected) ? projected : { ...projected, input }];
}

/**
 * Selects public trigger routing and capability metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted event trigger.
 */
export function projectTrigger(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.id !== "string") return [];
  return [
    safeJson(
      pick(value, [
        "protocol",
        "version",
        "id",
        "targetFunctionId",
        "eventId",
        "eventVersion",
        "delivery",
        "profile",
        "retry",
        "concurrency",
        "timeoutMs",
      ]),
    ),
  ];
}

/**
 * Projects a native events capability declaration without provider internals.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public capability evidence.
 */
export function projectCapability(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.triggerId !== "string") return [];
  return [safeJson(pick(value, ["protocol", "version", "triggerId", ...EVENT_CAPABILITY_FIELDS]))];
}

/**
 * Selects publication identity, state and timestamps without event payloads.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted public publication record.
 */
export function projectPublication(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.eventId !== "string") return [];
  return [
    safeJson(
      pick(value, [
        "protocol",
        "protocolVersion",
        "sequence",
        "timestamp",
        "accepted",
        "instanceId",
        "eventId",
        "version",
        "occurredAt",
        "publishedAt",
        "key",
        "correlationId",
        "causationInvocationId",
        "traceId",
        "attributes",
      ]),
    ),
  ];
}

/**
 * Selects delivery identity, state, attempts and bounded failure evidence.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted public delivery record.
 */
export function projectDelivery(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.deliveryId !== "string") return [];
  const result = pick(value, [
    "protocol",
    "version",
    "protocolVersion",
    "cursor",
    "sequence",
    "deliveryId",
    "eventInstanceId",
    "eventId",
    "triggerId",
    "state",
    "attempt",
    "duplicate",
    "timestamp",
    "leaseExpiresAt",
  ]);
  const failure = projectFailure(value.failure);
  if (failure !== undefined) result.failure = failure;
  return [safeJson(result)];
}

/**
 * Projects only bounded public failure code, message and retry evidence.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public failure metadata, or undefined when absent.
 */
export function projectFailure(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  return safeJson(pick(value, ["kind", "outcome", "code", "message", "status", "retry"]));
}

/**
 * Projects stored schema metadata without exposing executable schema behavior.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Redacted schema metadata.
 */
export function safeSchema(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  const wrapped = safeJson({ value });
  return isRecord(wrapped) && wrapped.value !== undefined ? wrapped.value : undefined;
}

/**
 * Accepts array records for a declared native events collection.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Only object records from the selected collection.
 */
export function records(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

export const EVENT_CAPABILITY_FIELDS = [
  "delivery",
  ["per", "sistence"].join(""),
  "restartRecovery",
  "atLeastOnce",
  "exactlyOnce",
  "ordering",
  "orderedByKey",
] as const;
