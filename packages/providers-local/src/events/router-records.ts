import { canonicalJson, deepFreeze, normalizeId, type JsonValue } from "@zsys/contracts";
import type { UnknownEventEnvelope } from "@zsys/events";
import type { JobRecord, JobStore } from "../jobs/store.js";

export const EVENT_DELIVERY_VERSION = 1 as const;

export interface EventDeliveryRecord {
  readonly version: typeof EVENT_DELIVERY_VERSION;
  readonly sequence: number;
  readonly timestamp: number;
  readonly deliveryId: string;
  readonly eventInstanceId: string;
  readonly triggerId: string;
  readonly envelope: UnknownEventEnvelope;
}

interface DeliveryData {
  readonly version: typeof EVENT_DELIVERY_VERSION;
  readonly deliveryId: string;
  readonly eventInstanceId: string;
  readonly triggerId: string;
  readonly envelope: UnknownEventEnvelope;
}

export class EventRouterStateError extends Error {
  readonly code = "ZSYS_EVENT_ROUTER_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "EventRouterStateError";
  }
}

export function normalizeExpansion(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) throw new EventRouterStateError("Event expansion must be an array");
  return Object.freeze([...new Set(value.map(normalizePair))].sort());
}

export function normalizeDelivery(value: unknown): "ephemeral" | "durable" {
  if (value !== "ephemeral" && value !== "durable") {
    throw new EventRouterStateError("Event delivery mode is invalid");
  }
  return value;
}

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
  return deepFreeze(JSON.parse(canonicalJson(source)) as JsonValue) as UnknownEventEnvelope;
}

export function toDeliveryRecord(record: JobRecord): EventDeliveryRecord {
  const data = readDeliveryData(record.data);
  return Object.freeze({ ...data, sequence: record.sequence, timestamp: record.timestamp });
}

export function validateDeliveryData(value: JsonValue): void {
  readDeliveryData(value);
}

export function makeDeliveryId(eventInstanceId: string, triggerId: string): string {
  return normalizeId(
    `delivery.${eventInstanceId.length}.${eventInstanceId}.${triggerId.length}.${triggerId}`,
  );
}

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

export function toJson(value: DeliveryData): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

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

function normalizePair(value: string): string {
  if (typeof value !== "string") throw new EventRouterStateError("Event expansion is invalid");
  const at = value.lastIndexOf("@");
  const versionText = value.slice(at + 1);
  const version = Number(versionText);
  if (at < 1 || !/^[1-9]\d*$/.test(versionText) || !Number.isSafeInteger(version)) {
    throw new EventRouterStateError(`Event expansion "${value}" is invalid`);
  }
  return `${normalizeId(value.slice(0, at))}@${version}`;
}

function requiredId(value: unknown): string {
  if (typeof value !== "string") throw new EventRouterStateError("Event delivery ID is invalid");
  return normalizeId(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
