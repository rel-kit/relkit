import { canonicalJson, normalizeId, type JsonValue } from "@zsys/contracts";
import type { RetryPolicy } from "@zsys/jobs";
import type { JobStore, JobRecord } from "../jobs/store.js";
import { readEntry } from "../jobs/queue-entry.js";
import type { JobQueue, JobQueueEntry } from "../jobs/queue-utils.js";
import { normalizeEnvelope, type EventDeliveryRecord } from "./router-records.js";
import type { EventDeliveryLedgerRecord, EventDeliveryResult } from "./delivery-types.js";

export const DEFAULT_RETRY: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

export function resultFrom(
  entry: JobQueueEntry,
  triggerId: string,
  duplicate: boolean,
  status: EventDeliveryResult["status"],
  error?: unknown,
  failure?: EventDeliveryResult["failure"],
  value?: unknown,
): EventDeliveryResult {
  return Object.freeze({
    deliveryId: entry.instanceId,
    triggerId,
    eventInstanceId: normalizeEnvelope(entry.input).instanceId,
    accepted: true,
    persisted: true,
    status,
    state: entry.state as EventDeliveryResult["state"],
    attempt: entry.attempt,
    duplicate,
    ...(error === undefined ? {} : { error }),
    ...(failure === undefined ? {} : { failure }),
    ...(value === undefined ? {} : { value }),
  });
}

export async function retryDelivery(
  queue: JobQueue,
  triggerId: string,
  deliveryId: string,
  now: () => number,
): Promise<EventDeliveryResult> {
  const normalized = normalizeId(deliveryId);
  await queue.recover(now());
  const entry = await queue.adminRetry(normalized, { availableAt: now() });
  return resultFrom(entry, triggerId, false, "queued");
}

export async function promoteDue(queue: JobQueue, now: () => number): Promise<void> {
  const time = now();
  for (const entry of queue.snapshot()) {
    if (entry.state === "delayed" && (entry.availableAt ?? Number.MAX_SAFE_INTEGER) <= time) {
      await queue.transition(entry.instanceId, "available", {
        expectedState: "delayed",
        availableAt: time,
      });
    }
  }
}

export function records(
  raw: readonly JobRecord[],
  triggerId: string,
  queue: JobQueue,
): EventDeliveryRecord[] {
  return queue.snapshot().map((entry) => {
    const record = [...raw].reverse().find((item) => item.instanceId === entry.instanceId);
    const envelope = normalizeEnvelope(entry.input);
    return Object.freeze({
      version: 1 as const,
      sequence: record?.sequence ?? entry.order,
      timestamp: record?.timestamp ?? entry.acceptedAt,
      deliveryId: entry.instanceId,
      eventInstanceId: envelope.instanceId,
      triggerId,
      envelope,
    });
  });
}

export function ledger(
  store: Pick<JobStore, "snapshot">,
  triggerId: string,
  queue: JobQueue,
): readonly EventDeliveryLedgerRecord[] {
  return Object.freeze(
    store
      .snapshot()
      .records.filter((record) => queue.get(record.instanceId) !== undefined)
      .filter((record) => record.kind !== "event-delivery-accepted")
      .map((record) => {
        const entry = readEntry(record);
        if (entry === undefined) throw new Error("Event delivery ledger state is invalid");
        const envelope = normalizeEnvelope(entry.input);
        return Object.freeze({
          version: 1 as const,
          sequence: record.sequence,
          timestamp: record.timestamp,
          cursor: record.sequence,
          deliveryId: entry.instanceId,
          eventInstanceId: envelope.instanceId,
          triggerId,
          envelope,
          state: entry.state as EventDeliveryResult["state"],
          attempt: entry.attempt,
          duplicate: entry.attempt > 1,
          ...(entry.leaseOwner === undefined ? {} : { leaseOwner: entry.leaseOwner }),
          ...(entry.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: entry.leaseExpiresAt }),
          ...(entry.failure === undefined ? {} : { failure: entry.failure }),
        });
      }),
  );
}

export function validateStoredData(value: JsonValue): void {
  if (isRecord(value) && value.input !== undefined) {
    readEntry({
      version: 1,
      sequence: 1,
      instanceId: "delivery.validation",
      kind: "available",
      timestamp: 0,
      data: value,
    });
    normalizeEnvelope(value.input);
    return;
  }
  if (isRecord(value) && value.envelope !== undefined) {
    normalizeEnvelope(value.envelope);
    return;
  }
  normalizeEnvelope(value);
}

export function normalizeRetry(value: RetryPolicy | undefined): RetryPolicy {
  const policy = value ?? DEFAULT_RETRY;
  positive(policy.maxAttempts, "retry.maxAttempts");
  nonNegative(policy.initialDelayMs, "retry.initialDelayMs");
  nonNegative(policy.maxDelayMs, "retry.maxDelayMs");
  if (policy.maxDelayMs < policy.initialDelayMs || policy.multiplier < 1)
    throw new TypeError("Event retry policy is invalid");
  if (!["none", "full", "equal"].includes(policy.jitter))
    throw new TypeError("Event retry policy jitter is invalid");
  return Object.freeze({ ...policy });
}

export function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be positive`);
  return value;
}

export function json(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${name} must be non-negative`);
  return value;
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
