import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import type { JobFailureMetadata, JobQueueState } from "../jobs/queue-utils.js";
import type { EVENT_ADMIN_PROTOCOL, EVENT_ADMIN_VERSION } from "./admin-contracts.js";

/** Environment mode controlling event administration mutations. */
export type EventAdminMode = "development" | "test" | "production";

/** Supported audited event administration action. */
export type EventAdminAction = "retry";

/** Whether an event administration action was applied or rejected. */
export type EventAdminActionOutcome = "applied" | "rejected";

/** Protocol identity carried by event administration contracts. */
export interface EventAdminVersion {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly version: typeof EVENT_ADMIN_VERSION;
}

/** Protocol identity carried by public event inspection contracts. */
export interface EventVersioned {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly protocolVersion: typeof EVENT_ADMIN_VERSION;
}

/** The serializable event contract registered by the active graph. */
export interface EventContractInput {
  readonly id: string;
  readonly version: number;
  readonly input: JsonValue;
  readonly sensitiveFields?: readonly string[];
  readonly source?: JsonValue;
}

/** Versioned declared event identity and schema metadata for inspection. */
export interface EventContract extends EventVersioned, EventContractInput {}

/** Exact event and delivery metadata for one generated event trigger. */
export interface EventTriggerContract extends EventAdminVersion {
  readonly id: string;
  readonly targetFunctionId?: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
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
  readonly originRequestId?: string;
  readonly producerTraceId?: string;
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

/** Versioned dead-letter status with safe retry/failure metadata. */
export interface EventDeadLetterContract extends EventDeliveryContract {
  readonly state: "dead-lettered";
  readonly failure: JobFailureMetadata;
}

/** Versioned truthful delivery capabilities for a registered trigger. */
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

/** Event, trigger, state and pagination filters for local inspection. */
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

/** Versioned bounded event, publication and delivery inspection response. */
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

/** Event mutation request carrying delivery identity and optional audit reason. */
export interface EventAdminActionRequest {
  readonly protocol?: typeof EVENT_ADMIN_PROTOCOL;
  readonly version?: typeof EVENT_ADMIN_VERSION;
  readonly deliveryId: string;
  readonly reason?: string;
}

/** Dead-letter retry request preserving event admin protocol identity. */
export type EventRetryRequest = EventAdminActionRequest;

/** Immutable audit record for an applied or rejected event mutation. */
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

/** Versioned mutation response containing status and audit record. */
export interface EventAdminActionContract extends EventAdminVersion {
  readonly action: EventAdminAction;
  readonly status: EventDeliveryContract;
  readonly record: EventAdminActionRecord;
}

/** Optional audit sink isolated from the event action outcome. */
export type EventAdminActionSink = (record: EventAdminActionRecord) => MaybePromise<void>;
