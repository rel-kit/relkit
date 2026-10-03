import type {
  EventLogBoundary,
  EventLogPaths,
  EventLogOptions,
  EventLogRecord,
  EventLogSnapshot,
  EventLog,
  EventLogInput,
} from "./log.types.js";
import {
  canonicalJson,
  deepFreeze,
  normalizeId,
  parseTracePropagation,
  type JsonValue,
} from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import { createJobStore, type JobRecord } from "../jobs/store.js";
import { createJobStorePaths } from "../jobs/store-files.js";

export type {
  EventLogBoundary,
  EventLogPaths,
  EventLogOptions,
  EventLogRecord,
  EventLogSnapshot,
  EventLog,
  EventLogInput,
} from "./log.types.js";

export const EVENT_LOG_VERSION = 1 as const;

/** Preserves the public event log state error identity and stable error code. */
export class EventLogStateError extends Error {
  readonly code = "RELKIT_EVENT_LOG_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "EventLogStateError";
  }
}

/** Builds the stable event journal and metadata paths below the owned root.
 * @param root - Owned state directory.
 * @returns Immutable owned event-log paths.
 */
export function createEventLogPaths(root: string): EventLogPaths {
  return createJobStorePaths(root);
}

/** Opens the durable accepted-event log and repairs invalid records on startup.
 * @param requestedRoot - Requested owned state directory.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The recovered durable event log.
 */
export async function createEventLog(
  requestedRoot: string,
  options: EventLogOptions = {},
): Promise<EventLog> {
  const store = await createJobStore(requestedRoot, {
    ...options,
    validateData: validateEnvelopeData,
  });
  const paths = createEventLogPaths(store.root);
  /**
   * Validates and appends a journal record before acknowledging its durable commit.
   * @param input - Caller operation input.
   * @returns The accepted immutable journal record.
   */
  const append = async (input: EventLogInput): Promise<EventLogRecord> => {
    const envelope = normalizeEnvelope(input);
    const record = await store.append({
      instanceId: envelope.instanceId,
      kind: "accepted",
      data: toJson(envelope),
    });
    return toEventRecord(record);
  };
  /**
   * Copies owner state into its safe immutable inspection representation.
   * @returns The snapshot operation without exposing mutable owner state.
   */
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

/** Projects a validated journal envelope into an event log record.
 * @param record - Durable record or audit entry.
 * @returns The event record projected from its journal envelope.
 */
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

/** Rejects malformed event envelope data before durable log replay.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
function validateEnvelopeData(value: JsonValue): void {
  normalizeEnvelope(value);
}

/** Validates the envelope and copies its JSON payload and safe attributes.
 * @param value - Value to validate, normalize or project.
 * @returns The validated immutable event envelope.
 */
function normalizeEnvelope(value: unknown): UnknownEventEnvelope {
  if (!isRecord(value)) throw new EventLogStateError("Event envelope must be an object");
  if (value.accepted !== undefined && value.accepted !== true) {
    throw new EventLogStateError("Event envelope acceptance is invalid");
  }
  const attributes = normalizeAttributes(value.attributes);
  const payload = JSON.parse(canonicalJson(value.payload)) as JsonValue;
  const key = optionalText(value.key, "key");
  const propagation = parseTracePropagation(value.propagation);
  const result = {
    instanceId: normalizeId(text(value.instanceId, "instanceId")),
    eventId: normalizeId(text(value.eventId, "eventId")),
    version: positiveInteger(value.version, "version"),
    payload,
    occurredAt: text(value.occurredAt, "occurredAt"),
    publishedAt: text(value.publishedAt, "publishedAt"),
    ...(key === undefined ? {} : { key }),
    ...(propagation === undefined ? {} : { propagation }),
    attributes,
  };
  return deepFreeze(result) as UnknownEventEnvelope;
}

/** Copies supported string event attributes into an immutable record.
 * @param value - Value to validate, normalize or project.
 * @returns The validated immutable string attribute record.
 */
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

/** Validates a required nonempty envelope string.
 * @param value - Value to validate, normalize or project.
 * @param name - Required field name used in diagnostics.
 * @returns The validated nonempty string.
 */
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new EventLogStateError(`Event ${name} is required`);
  }
  return value;
}

/** Validates an optional envelope string when present.
 * @param value - Value to validate, normalize or project.
 * @param name - Required field name used in diagnostics.
 * @returns The validated string or undefined.
 */
function optionalText(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return text(value, name);
}

/** Rejects event versions outside the positive safe integer range.
 * @param value - Value to validate, normalize or project.
 * @param name - Required field name used in diagnostics.
 * @returns The validated positive safe integer.
 */
function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new EventLogStateError(`Event ${name} is invalid`);
  }
  return value as number;
}

/** Copies an unknown value into canonical JSON for stable durable encoding.
 * @param value - Value to validate, normalize or project.
 * @returns The canonical JSON copy.
 */
function toJson(value: UnknownEventEnvelope): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
