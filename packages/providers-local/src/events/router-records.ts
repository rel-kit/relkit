import type { EventDeliveryRecord, DeliveryData } from "./router-records.types.js";
import { canonicalJson, deepFreeze, normalizeId, type JsonValue } from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { JobRecord, JobStore } from "../jobs/store.js";

export type { EventDeliveryRecord } from "./router-records.types.js";

export const EVENT_DELIVERY_VERSION = 1 as const;

/** Preserves the public event router state error identity and stable error code. */
export class EventRouterStateError extends Error {
  readonly code = "RELKIT_EVENT_ROUTER_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "EventRouterStateError";
  }
}

/** Validates the durable or ephemeral delivery mode.
 * @param value - Value to validate, normalize or project.
 * @returns The supported delivery mode.
 */
export function normalizeDelivery(value: unknown): "ephemeral" | "durable" {
  if (value !== "ephemeral" && value !== "durable") {
    throw new EventRouterStateError("Event delivery mode is invalid");
  }
  return value;
}

/** Validates the envelope and copies its JSON payload and safe attributes.
 * @param input - Caller-provided domain input.
 * @returns The validated immutable event envelope.
 */
export function normalizeEnvelope(input: unknown): UnknownEventEnvelope {
  if (!isRecord(input)) throw new EventRouterStateError("Accepted event envelope is invalid");
  let source: unknown = input;
  if ("envelope" in input) {
    if (input.accepted !== true) throw new EventRouterStateError("Event was not accepted");
    source = input.envelope;
  } else if (input.accepted !== undefined) {
    if (input.accepted !== true) throw new EventRouterStateError("Event was not accepted");
    const { accepted: _accepted, ...envelope } = input;
    source = envelope;
  }
  if (!isRecord(source)) throw new EventRouterStateError("Accepted event envelope is invalid");
  return deepFreeze(
    JSON.parse(canonicalJson(source)) as JsonValue,
  ) as unknown as UnknownEventEnvelope;
}

/** Projects a durable journal record into its delivery identity and envelope.
 * @param record - Durable record or audit entry.
 * @returns The public delivery record.
 */
export function toDeliveryRecord(record: JobRecord): EventDeliveryRecord {
  const data = readDeliveryData(record.data);
  return Object.freeze({ ...data, sequence: record.sequence, timestamp: record.timestamp });
}

/** Rejects malformed delivery identities or envelopes during record replay.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function validateDeliveryData(value: JsonValue): void {
  readDeliveryData(value);
}

/** Derives a stable identity from the publication and target trigger.
 * @param eventInstanceId - Publication instance identity.
 * @param triggerId - Registered trigger identity.
 * @returns The stable publication/trigger delivery identity.
 */
export function makeDeliveryId(eventInstanceId: string, triggerId: string): string {
  return normalizeId(
    `delivery.${eventInstanceId.length}.${eventInstanceId}.${triggerId.length}.${triggerId}`,
  );
}

/** Appends delivery acceptance before acknowledging durable fanout.
 * @param store - Owning persisted-state or journal operations.
 * @param envelope - Validated event envelope.
 * @param triggerId - Registered trigger identity.
 * @returns The durable acceptance record.
 */
export async function appendDeliveryAcceptance(
  store: JobStore,
  envelope: UnknownEventEnvelope,
  triggerId: string,
): Promise<void> {
  const deliveryId = makeDeliveryId(envelope.instanceId, triggerId);
  await store.append({
    instanceId: deliveryId,
    kind: "event-delivery-accepted",
    data: toJson({
      version: EVENT_DELIVERY_VERSION,
      deliveryId,
      eventInstanceId: envelope.instanceId,
      triggerId,
      envelope,
    }),
  });
}

/** Copies an unknown value into canonical JSON for stable durable encoding.
 * @param value - Value to validate, normalize or project.
 * @returns The canonical JSON copy.
 */
export function toJson(value: DeliveryData): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

/** Decodes the persisted delivery payload after its format checks.
 * @param value - Value to validate, normalize or project.
 * @returns The validated persisted delivery payload.
 */
function readDeliveryData(value: JsonValue): DeliveryData {
  if (!isRecord(value) || value.version !== EVENT_DELIVERY_VERSION) {
    throw new EventRouterStateError("Event delivery record is invalid");
  }
  return {
    version: EVENT_DELIVERY_VERSION,
    deliveryId: requiredId(value.deliveryId),
    eventInstanceId: requiredId(value.eventInstanceId),
    triggerId: requiredId(value.triggerId),
    envelope: normalizeEnvelope(value.envelope),
  };
}

/** Normalizes a required publication, event or trigger identity.
 * @param value - Value to validate, normalize or project.
 * @returns The normalized required identifier.
 */
function requiredId(value: unknown): string {
  if (typeof value !== "string") throw new EventRouterStateError("Event delivery ID is invalid");
  return normalizeId(value);
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
