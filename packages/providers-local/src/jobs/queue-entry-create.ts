import { canonicalJson, deepFreeze, normalizeId, type JsonValue } from "@relkit/contracts";
import { assertIdempotencyRecord } from "./idempotency.js";
import {
  assertTime,
  JobQueueStateError,
  type JobFailureMetadata,
  type JobIdempotencyRecord,
  type JobQueueEntry,
  type JobQueueState,
} from "./queue-utils.js";

/** Validates and constructs the initial durable queue entry.
 * @param instanceId - Queue or journal instance identity.
 * @param state - Current service-owned state.
 * @param input - Caller-provided domain input.
 * @param profile - Local provider profile partition.
 * @param acceptedAt - Acceptance clock time in milliseconds.
 * @param order - Stable acceptance ordering number.
 * @param attempt - One-based completed attempt number.
 * @param propagation - Validated trace propagation metadata.
 * @param availableAt - Earliest eligibility time in milliseconds.
 * @param leaseExpiresAt - Lease deadline in milliseconds.
 * @param leaseOwner - Token identifying the lease owner.
 * @param idempotency - Deduplication policy or retained acceptance record.
 * @param failure - Attempt failure to classify.
 * @returns The validated initial queue entry.
 */
export function makeEntry(
  instanceId: string,
  state: JobQueueState,
  input: JsonValue,
  profile: string,
  acceptedAt: number,
  order: number,
  attempt: number,
  propagation?: JobQueueEntry["propagation"],
  availableAt?: number,
  leaseExpiresAt?: number,
  leaseOwner?: string,
  idempotency?: JobIdempotencyRecord,
  failure?: JobFailureMetadata,
): JobQueueEntry {
  assertTime(acceptedAt, "accepted time");
  if (!Number.isSafeInteger(order) || order < 1)
    throw new JobQueueStateError("Queue order is invalid");
  if (!Number.isSafeInteger(attempt) || attempt < 0)
    throw new JobQueueStateError("Attempt is invalid");
  if (failure !== undefined) assertFailure(failure);
  if (idempotency !== undefined) assertIdempotencyRecord(idempotency);
  return deepFreeze({
    instanceId: normalizeId(instanceId),
    state,
    input: JSON.parse(canonicalJson(input)) as JsonValue,
    profile: normalizeId(profile),
    attempt,
    acceptedAt,
    order,
    ...(availableAt === undefined ? {} : { availableAt }),
    ...(leaseOwner === undefined ? {} : { leaseOwner: normalizeId(leaseOwner) }),
    ...(leaseExpiresAt === undefined ? {} : { leaseExpiresAt }),
    ...(idempotency === undefined ? {} : { idempotency: { ...idempotency } }),
    ...(failure === undefined
      ? {}
      : {
          failure: JSON.parse(canonicalJson(failure)) as JobFailureMetadata,
        }),
    ...(propagation === undefined ? {} : { propagation }),
  });
}

/** Validates the public failure metadata retained by a queue transition.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertFailure(value: JobFailureMetadata): void {
  const kinds = ["application", "provider", "cancellation", "timeout", "defect"];
  const outcomes = ["declared-error", "provider-failure", "cancelled", "timeout", "defect"];
  if (
    !kinds.includes(value.kind) ||
    !outcomes.includes(value.outcome) ||
    typeof value.code !== "string" ||
    value.code.trim() === "" ||
    typeof value.message !== "string" ||
    value.message.trim() === ""
  )
    throw new JobQueueStateError("Job failure metadata is invalid");
  if (value.status !== undefined && !Number.isSafeInteger(value.status))
    throw new JobQueueStateError("Job failure status is invalid");
  if (value.retry !== undefined && value.retry !== "never" && value.retry !== "later")
    throw new JobQueueStateError("Job failure retry classification is invalid");
  if (value.afterMs !== undefined && (!Number.isSafeInteger(value.afterMs) || value.afterMs < 0))
    throw new JobQueueStateError("Job failure retry delay is invalid");
  if (value.data !== undefined) canonicalJson(value.data);
}
