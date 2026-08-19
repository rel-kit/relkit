import type { JsonValue } from "@zsys/contracts";
import {
  assertTime,
  JobQueueStateError,
  type JobIdempotencyDefinition,
  type JobIdempotencyRecord,
  type JobQueueAcceptance,
  type JobQueueEntry,
} from "./queue-utils.js";

export interface IdempotencyPreparation {
  readonly record?: JobIdempotencyRecord;
  readonly duplicate?: JobQueueAcceptance;
}

/** Validates the static idempotency policy supplied by a job descriptor. */
export function validateIdempotencyDefinition(value: unknown): JobIdempotencyDefinition {
  if (!isRecord(value)) throw new JobQueueStateError("Idempotency definition is invalid");
  if (typeof value.key !== "string" || value.key.trim() === "")
    throw new JobQueueStateError("Idempotency key field is required");
  const retentionMs = value.retentionMs;
  if (typeof retentionMs !== "number" || !Number.isSafeInteger(retentionMs) || retentionMs < 1)
    throw new JobQueueStateError("Idempotency retention must be a positive integer");
  return Object.freeze({ key: value.key.trim(), retentionMs });
}

/** Extracts and validates the non-empty string value used as a job idempotency key. */
export function extractIdempotencyRecord(
  input: JsonValue,
  definition: JobIdempotencyDefinition,
  acceptedAt: number,
): JobIdempotencyRecord {
  const policy = validateIdempotencyDefinition(definition);
  assertTime(acceptedAt, "accepted time");
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new JobQueueStateError("Idempotency input must be an object");
  const record = input as { readonly [key: string]: JsonValue };
  if (!Object.prototype.hasOwnProperty.call(record, policy.key))
    throw new JobQueueStateError(`Idempotency input is missing "${policy.key}"`);
  const value = record[policy.key];
  if (typeof value !== "string" || value.trim() === "")
    throw new JobQueueStateError(`Idempotency input "${policy.key}" must be non-empty text`);
  if (policy.retentionMs > Number.MAX_SAFE_INTEGER - acceptedAt)
    throw new JobQueueStateError("Idempotency expiry is invalid");
  return Object.freeze({ key: value.trim(), expiresAt: acceptedAt + policy.retentionMs });
}

/** Validates the compact durable record stored alongside its accepted job. */
export function assertIdempotencyRecord(value: JobIdempotencyRecord): void {
  if (
    typeof value.key !== "string" ||
    value.key.trim() === "" ||
    value.key !== value.key.trim() ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt < 1
  )
    throw new JobQueueStateError("Job idempotency record is invalid");
}

export function readIdempotencyRecord(
  value: JsonValue | undefined,
): JobIdempotencyRecord | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new JobQueueStateError("Job idempotency record is invalid");
  const record = value as unknown as JobIdempotencyRecord;
  assertIdempotencyRecord(record);
  return record;
}

/** Finds the oldest still-retained acceptance for a key. Expired records are ignored. */
export function findActiveIdempotency(
  entries: Iterable<JobQueueEntry>,
  key: string,
  now: number,
): JobQueueEntry | undefined {
  assertTime(now, "idempotency time");
  let match: JobQueueEntry | undefined;
  for (const entry of entries) {
    if (entry.idempotency?.key !== key || entry.idempotency.expiresAt <= now) continue;
    if (match === undefined || entry.order < match.order) match = entry;
  }
  return match;
}

export function prepareIdempotency(
  input: JsonValue,
  definition: JobIdempotencyDefinition | undefined,
  entries: Iterable<JobQueueEntry>,
  now: number,
  acceptedAt: number,
): IdempotencyPreparation {
  if (definition === undefined) return {};
  const record = extractIdempotencyRecord(input, definition, acceptedAt);
  const duplicate = findActiveIdempotency(entries, record.key, now);
  return duplicate === undefined ? { record } : { duplicate: acceptance(duplicate, true) };
}

export function acceptance(entry: JobQueueEntry, duplicate: boolean): JobQueueAcceptance {
  return Object.freeze({
    ...entry,
    accepted: true as const,
    duplicate,
    ...(entry.idempotency === undefined
      ? {}
      : {
          idempotencyKey: entry.idempotency.key,
          idempotencyExpiresAt: entry.idempotency.expiresAt,
        }),
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
