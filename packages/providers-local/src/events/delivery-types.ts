import type { UnknownEventEnvelope } from "@relkit/events";
import type { RetryPolicy } from "@relkit/jobs";
import type { JobFailureMetadata, JobQueueCounts } from "../jobs/queue-utils.js";
import type { JobStoreBoundary } from "../jobs/store.js";
import type { EventDeliveryRecord } from "./router-records.js";

export const EVENT_DELIVERY_CAPABILITIES = Object.freeze({
  persistence: "restart-recovery",
  restartRecovery: true,
  atLeastOnce: true,
  exactlyOnce: false,
  ordering: "unsupported",
  orderedByKey: false,
} as const);
export type EventDeliveryCapabilities = typeof EVENT_DELIVERY_CAPABILITIES;

export type EventDeliveryBoundary = JobStoreBoundary | "handler-success-before-ack";

export interface EventDeliveryBinding {
  readonly id: string;
  readonly invoke: (envelope: UnknownEventEnvelope) => Promise<unknown>;
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}

export interface EventDeliveryOptions {
  readonly now?: () => number;
  readonly random?: () => number;
  readonly ownerToken?: string;
  readonly leaseDurationMs?: number;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly onBoundary?: (boundary: EventDeliveryBoundary) => void | Promise<void>;
}

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

export interface EventDeliveryLedgerRecord extends EventDeliveryRecord {
  readonly cursor: number;
  readonly state: EventDeliveryResult["state"];
  readonly attempt: number;
  readonly duplicate: boolean;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: number;
  readonly failure?: JobFailureMetadata;
}

export interface EventDeliverySnapshot {
  readonly cursor: number;
  readonly records: readonly EventDeliveryRecord[];
  readonly ledger: readonly EventDeliveryLedgerRecord[];
  readonly counts: JobQueueCounts;
  readonly capabilities: typeof EVENT_DELIVERY_CAPABILITIES;
}

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
