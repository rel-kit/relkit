import type { IdempotencyPreparation } from "./idempotency.types.js";
import type { JsonValue } from "@relkit/contracts";
import {
  assertTime,
  JobQueueStateError,
  type JobIdempotencyDefinition,
  type JobIdempotencyRecord,
  type JobQueueAcceptance,
  type JobQueueEntry,
} from "./queue-utils.js";

export type { IdempotencyPreparation } from "./idempotency.types.js";

/** Validates the static idempotency policy supplied by a job descriptor.
 * @param value - Value to validate, normalize or project.
 * @returns The normalized deduplication policy.
 */
export function validateIdempotencyDefinition(value: unknown): JobIdempotencyDefinition {
  if (!isRecord(value)) throw new JobQueueStateError("Idempotency definition is invalid");
  if (typeof value.key !== "string" || value.key.trim() === "")
    throw new JobQueueStateError("Idempotency key field is required");
  const retentionMs = value.retentionMs;
  if (typeof retentionMs !== "number" || !Number.isSafeInteger(retentionMs) || retentionMs < 1)
    throw new JobQueueStateError("Idempotency retention must be a positive integer");
  return Object.freeze({ key: value.key.trim(), retentionMs });
}

/** Extracts and validates the non-empty string value used as a job idempotency key.
 * @param input - Caller-provided domain input.
 * @param definition - Declared domain policy or identity configuration.
 * @param acceptedAt - Acceptance clock time in milliseconds.
 * @returns The validated stored acceptance identity when present.
 */
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

/** Validates the compact durable record stored alongside its accepted job.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
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

/** Validates persisted deduplication identity and its expiry window.
 * @param value - Value to validate, normalize or project.
 * @returns The validated stored deduplication metadata.
 */
export function readIdempotencyRecord(
  value: JsonValue | undefined,
): JobIdempotencyRecord | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new JobQueueStateError("Job idempotency record is invalid");
  const record = value as unknown as JobIdempotencyRecord;
  assertIdempotencyRecord(record);
  return record;
}

/** Finds the oldest still-retained acceptance for a key. Expired records are ignored.
 * @param entries - Persisted entries in the owning index.
 * @param key - Application or durable-storage key.
 * @param now - Current clock time in milliseconds.
 * @returns The matching unexpired acceptance, or undefined.
 */
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

/** Resolves an existing acceptance or constructs a new bounded deduplication record.
 * @param input - Caller-provided domain input.
 * @param definition - Declared domain policy or identity configuration.
 * @param entries - Persisted entries in the owning index.
 * @param now - Current clock time in milliseconds.
 * @param acceptedAt - Acceptance clock time in milliseconds.
 * @returns The prior acceptance or newly prepared deduplication record.
 */
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

/** Projects a queue entry into its acceptance receipt.
 * @param entry - Current queue or storage entry.
 * @param duplicate - Whether an existing acceptance satisfied this request.
 * @returns The public acceptance receipt.
 */
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

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
