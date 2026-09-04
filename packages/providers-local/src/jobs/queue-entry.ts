import {
  canonicalJson,
  normalizeId,
  parseTracePropagation,
  type JsonValue,
} from "@relkit/contracts";
import type { JobRecord, JobStore } from "./store.js";
import { readIdempotencyRecord } from "./idempotency.js";
import { assertFailure, makeEntry } from "./queue-entry-create.js";
import {
  JOB_QUEUE_STATES,
  JobQueueStateError,
  assertTime,
  type JobQueueEntry,
  type JobFailureMetadata,
  type JobQueueState,
  type JobQueueTransitionOptions,
} from "./queue-utils.js";

export async function persist(store: JobStore, entry: JobQueueEntry): Promise<void> {
  await store.append({ instanceId: entry.instanceId, kind: entry.state, data: encode(entry) });
}

export function nextEntry(
  current: JobQueueEntry,
  state: JobQueueState,
  options: JobQueueTransitionOptions,
  clock: () => number,
): JobQueueEntry {
  const attempt = options.attempt ?? current.attempt;
  if (!Number.isSafeInteger(attempt) || attempt < 0)
    throw new JobQueueStateError("Attempt is invalid");
  if (state === "delayed" && options.availableAt === undefined)
    throw new JobQueueStateError("Delayed jobs require an available time");
  if (state === "leased" && options.leaseExpiresAt === undefined)
    throw new JobQueueStateError("Leased jobs require an expiry");
  if (state === "leased" && options.availableAt !== undefined)
    throw new JobQueueStateError("Leased jobs cannot have an available time");
  if (
    (state === "completed" || state === "dead-lettered") &&
    (options.availableAt !== undefined || options.leaseExpiresAt !== undefined)
  )
    throw new JobQueueStateError("Terminal jobs cannot retain lease metadata");
  const availableAt =
    state === "available"
      ? (options.availableAt ?? clock())
      : state === "delayed"
        ? options.availableAt
        : undefined;
  const leaseExpiresAt = state === "leased" ? options.leaseExpiresAt : undefined;
  const leaseOwner = state === "leased" ? optionalOwner(options.leaseOwner) : undefined;
  const failure =
    state === "delayed" || state === "dead-lettered"
      ? (options.failure ?? current.failure)
      : undefined;
  const idempotency = current.idempotency;
  if (availableAt !== undefined) assertTime(availableAt, "available time");
  if (leaseExpiresAt !== undefined) assertTime(leaseExpiresAt, "lease expiry");
  return makeEntry(
    current.instanceId,
    state,
    current.input,
    current.profile,
    current.acceptedAt,
    current.order,
    attempt,
    current.propagation,
    availableAt,
    leaseExpiresAt,
    leaseOwner,
    idempotency,
    failure,
  );
}

export function readEntry(record: JobRecord): JobQueueEntry | undefined {
  if (!isState(record.kind)) return undefined;
  if (!isRecord(record.data))
    throw new JobQueueStateError(`Job ${record.instanceId} data is invalid`);
  const data = record.data;
  if (
    data.input === undefined ||
    data.profile === undefined ||
    data.acceptedAt === undefined ||
    data.attempt === undefined ||
    data.order === undefined
  )
    throw new JobQueueStateError(`Job ${record.instanceId} data is incomplete`);
  return makeEntry(
    record.instanceId,
    record.kind,
    data.input,
    normalizeId(data.profile),
    numberValue(data.acceptedAt, "accepted time"),
    numberValue(data.order, "queue order"),
    numberValue(data.attempt, "attempt"),
    parseTracePropagation(data.propagation),
    optionalNumber(data.availableAt, "available time"),
    optionalNumber(data.leaseExpiresAt, "lease expiry"),
    optionalOwner(data.leaseOwner),
    readIdempotencyRecord(data.idempotency),
    optionalFailure(data.failure),
  );
}

function encode(entry: JobQueueEntry): JsonValue {
  return JSON.parse(canonicalJson(entry)) as JsonValue;
}

function isState(value: string): value is JobQueueState {
  return (JOB_QUEUE_STATES as readonly string[]).includes(value);
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalNumber(value: JsonValue | undefined, label: string): number | undefined {
  return value === undefined ? undefined : numberValue(value, label);
}

function optionalOwner(value: JsonValue | undefined): string | undefined {
  return value === undefined ? undefined : normalizeId(value);
}

function optionalFailure(value: JsonValue | undefined): JobFailureMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new JobQueueStateError("Job failure metadata is invalid");
  const failure = value as unknown as JobFailureMetadata;
  assertFailure(failure);
  return failure;
}

function numberValue(value: JsonValue, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new JobQueueStateError(`Job ${label} is invalid`);
  return value;
}
