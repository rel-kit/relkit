import type { RetryPolicy } from "@relkit/jobs/legacy";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventContractInput } from "./admin-contracts.js";
import type { EventLogInput, EventLogRecord } from "./log.js";
import type {
  EventDeliveryBoundary,
  EventDeliveryLedgerRecord,
  EventDeliveryInvocationOptions,
} from "./delivery-types.js";
import type { EventDeliveryRecord } from "./router-records.js";

/** Delivery outcome including acceptance and actual persistence guarantees. */
export interface EventDeliveryResult {
  readonly triggerId: string;
  readonly delivery: "ephemeral" | "durable";
  readonly deliveryId?: string;
  readonly eventInstanceId?: string;
  readonly accepted: boolean;
  readonly persisted: boolean;
  readonly status: "queued" | "completed" | "failed" | "dropped";
  readonly state?: "available" | "leased" | "delayed" | "completed" | "dead-lettered";
  readonly attempt?: number;
  readonly duplicate?: boolean;
  readonly capacity?: number;
  readonly dropPolicy?: "drop-newest";
  readonly restartRecovery?: false;
  readonly dropReason?: "capacity";
  readonly value?: unknown;
  readonly error?: unknown;
  readonly failure?: unknown;
}

/** Declared trigger identity, event match and executable target binding. */
export interface EventRouterTrigger {
  readonly id: string;
  readonly targetFunctionId?: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly invoke: (
    envelope: UnknownEventEnvelope,
    options?: EventDeliveryInvocationOptions,
  ) => Promise<unknown>;
}

/** Storage and delivery construction settings for the local router. */
export interface EventRouterOptions {
  readonly onBoundary?: (
    boundary: EventDeliveryBoundary,
    triggerId: string,
  ) => void | Promise<void>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly ownerToken?: string;
  readonly leaseDurationMs?: number;
  readonly ephemeralCapacity?: number;
}

/** Fanout options controlling immediate worker execution. */
export interface EventRouterRouteOptions {
  readonly run?: boolean;
}

/** Immutable contracts, triggers, publications and delivery status inspection. */
export interface EventRouterSnapshot {
  readonly records: readonly EventDeliveryRecord[];
  readonly contracts: readonly EventContractInput[];
  readonly triggers: readonly EventTriggerSnapshot[];
  readonly publications: readonly EventLogRecord[];
  readonly deliveries: readonly EventDeliveryLedgerRecord[];
}

/** Safe trigger configuration and runtime delivery counters. */
export interface EventTriggerSnapshot {
  readonly ephemeral?: import("./ephemeral.js").EphemeralDeliverySnapshot;
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

/** Publication result containing each matching trigger delivery outcome. */
export interface EventFanoutResult {
  readonly event: UnknownEventEnvelope;
  readonly matchedTriggerIds: readonly string[];
  readonly deliveries: readonly EventDeliveryResult[];
}

/** Compatibility router interface for registration, fanout, inspection and lifecycle. */
export interface EventRouter {
  readonly root: string;
  readonly registerContract: (contract: unknown) => Promise<void>;
  readonly registerTrigger: (binding: EventRouterTrigger) => Promise<void>;
  readonly route: (
    event: EventRouterInput,
    options?: EventRouterRouteOptions,
  ) => Promise<EventFanoutResult>;
  readonly runNext: (triggerId?: string) => Promise<EventDeliveryResult | undefined>;
  readonly drain: () => Promise<readonly EventDeliveryResult[]>;
  readonly retry: (deliveryId: string) => Promise<EventDeliveryResult>;
  readonly snapshot: () => EventRouterSnapshot;
  readonly close: () => Promise<void>;
}

/** Publication input accepted as a log record or event envelope. */
export type EventRouterInput = EventLogRecord | EventLogInput;
