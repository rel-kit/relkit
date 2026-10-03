import {
  pageLimit,
  validateQuery,
  assertVersion,
  assertMode,
  safeId,
  readReason,
} from "./admin-validation.js";
import { deepFreeze, normalizeId, parseTracePropagation } from "@relkit/contracts";
import type { EventDeliveryLedgerRecord } from "./delivery-types.js";
import {
  EVENT_ADMIN_PROTOCOL,
  EVENT_ADMIN_VERSION,
  type EventContract,
  type EventContractInput,
  type EventDeliveryContract,
  type EventPublicationContract,
  type EventQueryRequest,
  type EventTriggerCapabilityContract,
  type EventTriggerContract,
} from "./admin-contracts.js";
import { EventAdminError } from "./admin-errors.js";
import type { EventTriggerSnapshot } from "./router-types.js";
import type { EventLogRecord } from "./log.js";

export {
  pageLimit,
  validateQuery,
  assertVersion,
  assertMode,
  safeId,
  readReason,
} from "./admin-validation.js";

/** Adds the event-admin protocol identity and freezes the response.
 * @param value - Value to validate, normalize or project.
 * @returns The frozen value carrying the administration protocol identity.
 * @typeParam T - Shape preserved by this operation.
 */
export function versioned<T extends object>(
  value: T,
): T & {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly version: typeof EVENT_ADMIN_VERSION;
} {
  return deepFreeze({ protocol: EVENT_ADMIN_PROTOCOL, version: EVENT_ADMIN_VERSION, ...value });
}
/** Adds the event protocol identity and freezes the contract projection.
 * @param value - Value to validate, normalize or project.
 * @returns The frozen value carrying the event protocol identity.
 * @typeParam T - Shape preserved by this operation.
 */
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
/** Projects a declared event contract into the versioned inspector representation.
 * @param value - Value to validate, normalize or project.
 * @returns The versioned event contract projection.
 */
export function toEvent(value: EventContractInput): EventContract {
  return eventVersioned({ ...value });
}
/** Projects trigger identity, target and delivery mode into inspection fields.
 * @param value - Value to validate, normalize or project.
 * @returns The safe trigger inspection projection.
 */
export function toTrigger(value: EventTriggerSnapshot): EventTriggerContract {
  return versioned({
    id: value.id,
    ...(value.targetFunctionId === undefined ? {} : { targetFunctionId: value.targetFunctionId }),
    eventId: value.eventId,
    eventVersion: value.eventVersion,
    delivery: value.delivery,
    ...(value.profile === undefined ? {} : { profile: value.profile }),
    ...(value.retry === undefined ? {} : { retry: value.retry }),
    ...(value.concurrency === undefined ? {} : { concurrency: value.concurrency }),
    ...(value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs }),
  });
}
/** Projects the actual persistence, recovery and overflow guarantees of a trigger.
 * @param value - Value to validate, normalize or project.
 * @returns The actual declared trigger capabilities.
 */
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

/** Projects a publication record into bounded inspection metadata.
 * @param value - Value to validate, normalize or project.
 * @returns The safe publication inspection record.
 */
export function toPublication(value: EventLogRecord): EventPublicationContract {
  const envelope = value.envelope;
  const propagation = parseTracePropagation(envelope.propagation);
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
    ...(propagation?.correlationId === undefined
      ? {}
      : { correlationId: propagation.correlationId }),
    ...(propagation?.originRequestId === undefined
      ? {}
      : { originRequestId: propagation.originRequestId }),
    ...(propagation === undefined ? {} : { producerTraceId: propagation.producer.traceId }),
    attributes: envelope.attributes,
  });
}

/** Projects a delivery ledger record into its versioned public status.
 * @param value - Value to validate, normalize or project.
 * @returns The immutable delivery status projection.
 */
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

/** Applies optional event, trigger and state filters to an inspected delivery.
 * @param value - Value to validate, normalize or project.
 * @param request - Caller domain request.
 * @returns Whether the candidate satisfies all supplied filters.
 */
export function matches(value: EventDeliveryContract, request: EventQueryRequest): boolean {
  if (request.eventId !== undefined && value.eventId !== normalizeId(request.eventId)) return false;
  if (request.eventVersion !== undefined && value.version !== request.eventVersion) return false;
  if (request.triggerId !== undefined && value.triggerId !== normalizeId(request.triggerId))
    return false;
  const states = request.states ?? (request.state === undefined ? undefined : [request.state]);
  return states === undefined || states.includes(value.state);
}

/** Validates the cursor and selects deliveries after its stable ordering key.
 * @param value - Value to validate, normalize or project.
 * @param cursor - Opaque continuation cursor from a previous page.
 * @returns Whether the record sorts strictly after the validated cursor.
 */
export function afterCursor(value: EventDeliveryContract, cursor: string | undefined): boolean {
  if (cursor === undefined) return true;
  const [raw, id] = cursor.split(":", 2);
  const sequence = Number(raw);
  if (!Number.isSafeInteger(sequence) || id === undefined)
    throw new EventAdminError("RELKIT_EVENT_ADMIN_CURSOR_INVALID", "Event query cursor is invalid");
  return value.cursor > sequence || (value.cursor === sequence && value.deliveryId > id);
}

/** Encodes the stable ordering key for the next delivery page.
 * @param value - Value to validate, normalize or project.
 * @returns The stable continuation cursor.
 */
export function nextCursor(value: EventDeliveryContract): string {
  return `${value.cursor}:${value.deliveryId}`;
}
