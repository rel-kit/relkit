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
