import { PROTOCOL_VERSION, type JsonValue, type MaybePromise } from "@zsys/contracts";
import type { RetryPolicy } from "@zsys/jobs";
import type { JobFailureMetadata, JobQueueState } from "../jobs/queue-utils.js";

export const EVENT_ADMIN_PROTOCOL = "zsys.events.admin" as const;
export const EVENT_ADMIN_VERSION = PROTOCOL_VERSION;

export type EventAdminMode = "development" | "test" | "production";
export type EventAdminAction = "retry";
export type EventAdminActionOutcome = "applied" | "rejected";

export interface EventAdminVersion {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly version: typeof EVENT_ADMIN_VERSION;
}

export interface EventVersioned {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly protocolVersion: typeof EVENT_ADMIN_VERSION;
}

/** The serializable event contract registered by the active graph. */
export interface EventContractInput {
  readonly id: string;
  readonly version: number;
  readonly payload: JsonValue;
  readonly sensitiveFields?: readonly string[];
  readonly source?: JsonValue;
}

export interface EventContract extends EventVersioned, EventContractInput {}

/** Selector and delivery metadata for one generic event trigger. */
export interface EventTriggerContract extends EventAdminVersion {
  readonly id: string;
  readonly targetFunctionId?: string;
  readonly selector?: JsonValue;
  readonly expansion: readonly string[];
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}

/** Safe publication metadata; payload data is intentionally not projected. */
export interface EventPublicationContract extends EventVersioned {
  readonly sequence: number;
  readonly timestamp: number;
  readonly accepted: true;
  readonly instanceId: string;
  readonly eventId: string;
  readonly version: number;
  readonly occurredAt: string;
  readonly publishedAt: string;
  readonly key?: string;
  readonly correlationId?: string;
  readonly causationInvocationId?: string;
  readonly traceId: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

/** Safe delivery state shared by current and dead-lettered attempts. */
export interface EventDeliveryContract extends EventVersioned {
  readonly cursor: number;
  readonly sequence: number;
  readonly deliveryId: string;
  readonly eventInstanceId: string;
  readonly eventId: string;
  readonly version: number;
  readonly triggerId: string;
  readonly state: Exclude<JobQueueState, "accepted">;
  readonly attempt: number;
  readonly duplicate: boolean;
  readonly timestamp: number;
  readonly leaseExpiresAt?: number;
  readonly failure?: JobFailureMetadata;
}

export interface EventDeadLetterContract extends EventDeliveryContract {
  readonly state: "dead-lettered";
  readonly failure: JobFailureMetadata;
}

export interface EventTriggerCapabilityContract extends EventAdminVersion {
  readonly triggerId: string;
  readonly delivery: "ephemeral" | "durable";
  readonly persistence: "none" | "restart-recovery";
  readonly restartRecovery: boolean;
  readonly atLeastOnce: boolean;
  readonly exactlyOnce: false;
  readonly ordering: "unsupported";
  readonly orderedByKey: false;
}

export interface EventQueryRequest {
  readonly protocol?: typeof EVENT_ADMIN_PROTOCOL;
  readonly version?: typeof EVENT_ADMIN_VERSION;
  readonly eventId?: string;
  readonly eventVersion?: number;
  readonly triggerId?: string;
  readonly state?: Exclude<JobQueueState, "accepted">;
  readonly states?: readonly Exclude<JobQueueState, "accepted">[];
  readonly cursor?: string;
  readonly limit?: number;
}

export interface EventQueryContract extends EventAdminVersion {
  readonly events: readonly EventContract[];
  readonly triggers: readonly EventTriggerContract[];
  readonly capabilities: readonly EventTriggerCapabilityContract[];
  readonly publications: readonly EventPublicationContract[];
  readonly items: readonly EventDeliveryContract[];
  readonly deliveries: readonly EventDeliveryContract[];
  readonly deadLetters: readonly EventDeadLetterContract[];
  readonly nextCursor?: string;
}

export interface EventAdminActionRequest {
  readonly protocol?: typeof EVENT_ADMIN_PROTOCOL;
  readonly version?: typeof EVENT_ADMIN_VERSION;
  readonly deliveryId: string;
  readonly reason?: string;
}

export type EventRetryRequest = EventAdminActionRequest;

export interface EventAdminActionRecord extends EventAdminVersion {
  readonly actionId: string;
  readonly action: EventAdminAction;
  readonly deliveryId: string;
  readonly eventInstanceId?: string;
  readonly triggerId?: string;
  readonly mode: EventAdminMode;
  readonly outcome: EventAdminActionOutcome;
  readonly requestedAt: number;
  readonly fromState?: Exclude<JobQueueState, "accepted">;
  readonly toState?: Exclude<JobQueueState, "accepted">;
  readonly errorCode?: string;
  readonly reason?: string;
}

export interface EventAdminActionContract extends EventAdminVersion {
  readonly action: EventAdminAction;
  readonly status: EventDeliveryContract;
  readonly record: EventAdminActionRecord;
}

export type EventAdminActionSink = (record: EventAdminActionRecord) => MaybePromise<void>;
