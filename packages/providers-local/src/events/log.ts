import { canonicalJson, deepFreeze, normalizeId, type JsonValue } from "@zsys/contracts";
import type { EventPublishResult, UnknownEventEnvelope } from "@zsys/events";
import {
  createJobStore,
  type JobRecord,
  type JobStoreBoundary,
  type JobStoreCheckpoint,
  type JobStoreIndex,
  type JobStoreOptions,
} from "../jobs/store.js";
import { createJobStorePaths } from "../jobs/store-files.js";

export const EVENT_LOG_VERSION = 1 as const;
export type EventLogBoundary = JobStoreBoundary;
export type EventLogPaths = ReturnType<typeof createJobStorePaths>;

export interface EventLogOptions extends Pick<JobStoreOptions, "now" | "onBoundary"> {}

export interface EventLogRecord {
  readonly version: typeof EVENT_LOG_VERSION;
  readonly sequence: number;
  readonly kind: "accepted";
  readonly accepted: true;
  readonly timestamp: number;
  readonly envelope: UnknownEventEnvelope;
}

export interface EventLogSnapshot {
  readonly records: readonly EventLogRecord[];
  readonly index: JobStoreIndex;
  readonly checkpoint: JobStoreCheckpoint;
}

export interface EventLog {
  readonly root: string;
  readonly paths: EventLogPaths;
  readonly append: (envelope: EventLogInput) => Promise<EventLogRecord>;
  readonly snapshot: () => EventLogSnapshot;
  readonly close: () => Promise<void>;
}

export type EventLogInput = UnknownEventEnvelope | EventPublishResult<string, number, unknown>;

export class EventLogStateError extends Error {
  readonly code = "ZSYS_EVENT_LOG_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "EventLogStateError";
  }
}

export function createEventLogPaths(root: string): EventLogPaths {
  return createJobStorePaths(root);
}

/** Opens the durable accepted-event log and repairs invalid records on startup. */
export async function createEventLog(
  requestedRoot: string,
  options: EventLogOptions = {},
): Promise<EventLog> {
  const store = await createJobStore(requestedRoot, {
    ...options,
    validateData: validateEnvelopeData,
  });
  const paths = createEventLogPaths(store.root);
  const append = async (input: EventLogInput): Promise<EventLogRecord> => {
    const envelope = normalizeEnvelope(input);
    const record = await store.append({
      instanceId: envelope.instanceId,
      kind: "accepted",
      data: toJson(envelope),
    });
    return toEventRecord(record);
  };
  const snapshot = (): EventLogSnapshot => {
    const current = store.snapshot();
    return Object.freeze({
      records: Object.freeze(current.records.map(toEventRecord)),
      index: current.index,
      checkpoint: current.checkpoint,
    });
  };
  return Object.freeze({ root: store.root, paths, append, snapshot, close: store.close });
}

function toEventRecord(record: JobRecord): EventLogRecord {
  if (record.version !== EVENT_LOG_VERSION || record.kind !== "accepted") {
    throw new EventLogStateError("Event log record is not an accepted event");
  }
  return Object.freeze({
    version: EVENT_LOG_VERSION,
    sequence: record.sequence,
    kind: "accepted",
    accepted: true,
    timestamp: record.timestamp,
    envelope: normalizeEnvelope(record.data),
  });
}

function validateEnvelopeData(value: JsonValue): void {
  normalizeEnvelope(value);
}

function normalizeEnvelope(value: unknown): UnknownEventEnvelope {
  if (!isRecord(value)) throw new EventLogStateError("Event envelope must be an object");
  if (value.accepted !== undefined && value.accepted !== true) {
    throw new EventLogStateError("Event envelope acceptance is invalid");
  }
  const attributes = normalizeAttributes(value.attributes);
  const payload = JSON.parse(canonicalJson(value.payload)) as JsonValue;
  const key = optionalText(value.key, "key");
  const correlationId = optionalText(value.correlationId, "correlationId");
  const causationInvocationId = optionalText(value.causationInvocationId, "causationInvocationId");
  const result = {
    instanceId: normalizeId(text(value.instanceId, "instanceId")),
    eventId: normalizeId(text(value.eventId, "eventId")),
    version: positiveInteger(value.version, "version"),
    payload,
    occurredAt: text(value.occurredAt, "occurredAt"),
    publishedAt: text(value.publishedAt, "publishedAt"),
    ...(key === undefined ? {} : { key }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(causationInvocationId === undefined ? {} : { causationInvocationId }),
    traceId: text(value.traceId, "traceId"),
    attributes,
  };
  return deepFreeze(result) as UnknownEventEnvelope;
}

function normalizeAttributes(value: unknown): Readonly<Record<string, string | number | boolean>> {
  if (!isRecord(value)) throw new EventLogStateError("Event attributes must be an object");
  const result: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (
      typeof item !== "string" &&
      typeof item !== "boolean" &&
      (typeof item !== "number" || !Number.isFinite(item))
    ) {
      throw new EventLogStateError(`Event attribute "${key}" is invalid`);
    }
    result[key] = item;
  }
  return Object.freeze(result);
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new EventLogStateError(`Event ${name} is required`);
  }
  return value;
}

function optionalText(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return text(value, name);
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new EventLogStateError(`Event ${name} is invalid`);
  }
  return value as number;
}

function toJson(value: UnknownEventEnvelope): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
