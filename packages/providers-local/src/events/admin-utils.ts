import { deepFreeze, normalizeId } from "@relkit/contracts";
import type { EventDeliveryLedgerRecord } from "./delivery-types.js";
import {
  EVENT_ADMIN_PROTOCOL,
  EVENT_ADMIN_VERSION,
  type EventContract,
  type EventContractInput,
  type EventDeliveryContract,
  type EventAdminMode,
  type EventVersioned,
  type EventPublicationContract,
  type EventQueryRequest,
  type EventTriggerCapabilityContract,
  type EventTriggerContract,
} from "./admin-contracts.js";
import { EventAdminError } from "./admin-errors.js";
import type { EventTriggerSnapshot } from "./router-types.js";
import type { EventLogRecord } from "./log.js";

export function versioned<T extends object>(
  value: T,
): T & {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly version: typeof EVENT_ADMIN_VERSION;
} {
  return deepFreeze({ protocol: EVENT_ADMIN_PROTOCOL, version: EVENT_ADMIN_VERSION, ...value });
}

export function eventVersioned<T extends object>(
  value: T,
): T & {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly protocolVersion: typeof EVENT_ADMIN_VERSION;
} {
  return deepFreeze({
    protocol: EVENT_ADMIN_PROTOCOL,
    protocolVersion: EVENT_ADMIN_VERSION,
    ...value,
  });
}

export function toEvent(value: EventContractInput): EventContract {
  return eventVersioned({ ...value });
}

export function toTrigger(value: EventTriggerSnapshot): EventTriggerContract {
  return versioned({
    id: value.id,
    ...(value.targetFunctionId === undefined ? {} : { targetFunctionId: value.targetFunctionId }),
    ...(value.selector === undefined ? {} : { selector: value.selector }),
    expansion: value.expansion,
    delivery: value.delivery,
    ...(value.profile === undefined ? {} : { profile: value.profile }),
    ...(value.retry === undefined ? {} : { retry: value.retry }),
    ...(value.concurrency === undefined ? {} : { concurrency: value.concurrency }),
  });
}

export function toCapability(value: EventTriggerSnapshot): EventTriggerCapabilityContract {
  const durable = value.delivery === "durable";
  return versioned({
    triggerId: value.id,
    delivery: value.delivery,
    persistence: durable ? "restart-recovery" : "none",
    restartRecovery: durable,
    atLeastOnce: durable,
    exactlyOnce: false as const,
    ordering: "unsupported" as const,
    orderedByKey: false as const,
  });
}

export function toPublication(value: EventLogRecord): EventPublicationContract {
  const envelope = value.envelope;
  return eventVersioned({
    sequence: value.sequence,
    timestamp: value.timestamp,
    accepted: true as const,
    instanceId: envelope.instanceId,
    eventId: envelope.eventId,
    version: envelope.version,
    occurredAt: envelope.occurredAt,
    publishedAt: envelope.publishedAt,
    ...(envelope.key === undefined ? {} : { key: envelope.key }),
    ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
    ...(envelope.causationInvocationId === undefined
      ? {}
      : { causationInvocationId: envelope.causationInvocationId }),
    traceId: envelope.traceId,
    attributes: envelope.attributes,
  });
}

export function toDelivery(value: EventDeliveryLedgerRecord): EventDeliveryContract {
  const envelope = value.envelope;
  return eventVersioned({
    cursor: value.cursor,
    sequence: value.sequence,
    deliveryId: value.deliveryId,
    eventInstanceId: value.eventInstanceId,
    eventId: envelope.eventId,
    version: envelope.version,
    triggerId: value.triggerId,
    state: value.state,
    attempt: value.attempt,
    duplicate: value.duplicate,
    timestamp: value.timestamp,
    ...(value.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: value.leaseExpiresAt }),
    ...(value.failure === undefined ? {} : { failure: value.failure }),
  });
}

export function matches(value: EventDeliveryContract, request: EventQueryRequest): boolean {
  if (request.eventId !== undefined && value.eventId !== normalizeId(request.eventId)) return false;
  if (request.eventVersion !== undefined && value.version !== request.eventVersion) return false;
  if (request.triggerId !== undefined && value.triggerId !== normalizeId(request.triggerId))
    return false;
  const states = request.states ?? (request.state === undefined ? undefined : [request.state]);
  return states === undefined || states.includes(value.state);
}

export function afterCursor(value: EventDeliveryContract, cursor: string | undefined): boolean {
  if (cursor === undefined) return true;
  const [raw, id] = cursor.split(":", 2);
  const sequence = Number(raw);
  if (!Number.isSafeInteger(sequence) || id === undefined)
    throw new EventAdminError("RELKIT_EVENT_ADMIN_CURSOR_INVALID", "Event query cursor is invalid");
  return value.cursor > sequence || (value.cursor === sequence && value.deliveryId > id);
}

export function nextCursor(value: EventDeliveryContract): string {
  return `${value.cursor}:${value.deliveryId}`;
}

export function pageLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new EventAdminError("RELKIT_EVENT_ADMIN_QUERY_INVALID", "Event query limit is invalid");
  return Math.min(value, 100);
}

export function validateQuery(request: EventQueryRequest): void {
  if (request.eventId !== undefined) normalizeId(request.eventId);
  if (request.triggerId !== undefined) normalizeId(request.triggerId);
  if (
    request.eventVersion !== undefined &&
    (!Number.isSafeInteger(request.eventVersion) || request.eventVersion < 1)
  )
    throw new EventAdminError("RELKIT_EVENT_ADMIN_QUERY_INVALID", "Event version is invalid");
  const states = request.states ?? (request.state === undefined ? [] : [request.state]);
  if (states.some((state) => !isState(state)))
    throw new EventAdminError("RELKIT_EVENT_ADMIN_QUERY_INVALID", "Event query state is invalid");
}

export function assertVersion(value: unknown): void {
  if (!isRecord(value))
    throw new EventAdminError(
      "RELKIT_EVENT_ADMIN_REQUEST_INVALID",
      "Event admin request is invalid",
    );
  if (
    (value.protocol !== undefined && value.protocol !== EVENT_ADMIN_PROTOCOL) ||
    (value.version !== undefined && value.version !== EVENT_ADMIN_VERSION)
  )
    throw new EventAdminError(
      "RELKIT_EVENT_ADMIN_PROTOCOL_MISMATCH",
      "Unsupported event admin protocol",
    );
}

export function assertMode(value: string): asserts value is EventAdminMode {
  if (value !== "development" && value !== "test" && value !== "production")
    throw new EventAdminError("RELKIT_EVENT_ADMIN_MODE_INVALID", "Event admin mode is invalid");
}

export function safeId(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch {
    return undefined;
  }
}

export function readReason(value: unknown): string | undefined {
  if (!isRecord(value) || value.reason === undefined) return undefined;
  if (typeof value.reason !== "string" || value.reason.trim() === "")
    throw new EventAdminError(
      "RELKIT_EVENT_ADMIN_REQUEST_INVALID",
      "Event action reason is invalid",
    );
  return value.reason.trim().slice(0, 256);
}

function isState(value: unknown): boolean {
  return ["available", "leased", "delayed", "completed", "dead-lettered"].includes(value as string);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
