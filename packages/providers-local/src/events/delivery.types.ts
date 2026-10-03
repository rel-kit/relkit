import type { UnknownEventEnvelope } from "@relkit/events";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import type { JobFailureMetadata, JobQueueCounts } from "../jobs/queue-utils.js";
import type { JobStoreBoundary } from "../jobs/store.js";
import type { EventDeliveryRecord } from "./router-records.js";
import type { EVENT_DELIVERY_CAPABILITIES } from "./delivery-types.js";

/** Actual durability, restart, overflow and cancellation guarantees. */
export type EventDeliveryCapabilities = typeof EVENT_DELIVERY_CAPABILITIES;

/** Durable delivery commit milestones exposed to hooks. */
export type EventDeliveryBoundary = JobStoreBoundary | "handler-success-before-ack";

/** Attempt metadata and cancellation supplied to a delivery target. */
export interface EventDeliveryInvocationOptions {
  readonly attempt: number;
  readonly replayed: boolean;
  readonly timeoutMs?: number;
}

/** Trigger identity and executable target for a durable delivery owner. */
export interface EventDeliveryBinding {
  readonly id: string;
  readonly invoke: (
    envelope: UnknownEventEnvelope,
    options?: EventDeliveryInvocationOptions,
  ) => Promise<unknown>;
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
}

/** Backlog, concurrency, retry and durable-boundary configuration. */
export interface EventDeliveryOptions {
  readonly now?: () => number;
  readonly random?: () => number;
  readonly ownerToken?: string;
  readonly leaseDurationMs?: number;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly onBoundary?: (boundary: EventDeliveryBoundary) => void | Promise<void>;
}

/** Delivery outcome including acceptance and actual persistence guarantees. */
export interface EventDeliveryResult {
  readonly deliveryId: string;
  readonly triggerId: string;
  readonly eventInstanceId: string;
  readonly accepted: boolean;
  readonly persisted: boolean;
  readonly status: "queued" | "completed" | "failed";
  readonly state: "available" | "leased" | "delayed" | "completed" | "dead-lettered";
  readonly attempt: number;
  readonly duplicate: boolean;
  readonly value?: unknown;
  readonly error?: unknown;
  readonly failure?: JobFailureMetadata;
}

/** Persisted delivery envelope joined with its latest queue state. */
export interface EventDeliveryLedgerRecord extends EventDeliveryRecord {
  readonly cursor: number;
  readonly state: EventDeliveryResult["state"];
  readonly attempt: number;
  readonly duplicate: boolean;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: number;
  readonly failure?: JobFailureMetadata;
}

/** Safe delivery counters and durable ledger inspection. */
export interface EventDeliverySnapshot {
  readonly cursor: number;
  readonly records: readonly EventDeliveryRecord[];
  readonly ledger: readonly EventDeliveryLedgerRecord[];
  readonly counts: JobQueueCounts;
  readonly capabilities: typeof EVENT_DELIVERY_CAPABILITIES;
}

/** Compatibility interface for accepting, executing and inspecting durable deliveries. */
export interface EventDelivery {
  readonly triggerId: string;
  readonly capabilities: EventDeliveryCapabilities;
  readonly accept: (envelope: UnknownEventEnvelope) => Promise<EventDeliveryResult>;
  readonly deliver: (envelope: UnknownEventEnvelope) => Promise<EventDeliveryResult>;
  readonly runNext: (deliveryId?: string) => Promise<EventDeliveryResult | undefined>;
  readonly retry: (deliveryId: string) => Promise<EventDeliveryResult>;
  readonly drain: () => Promise<readonly EventDeliveryResult[]>;
  readonly recover: (now?: number) => Promise<readonly EventDeliveryLedgerRecord[]>;
  readonly snapshot: () => EventDeliverySnapshot;
  readonly close: () => Promise<void>;
}
