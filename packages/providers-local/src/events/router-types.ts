import type { JsonValue } from "@zsys/contracts";
import type { RetryPolicy } from "@zsys/jobs";
import type { UnknownEventEnvelope } from "@zsys/events";
import type { EventContractInput } from "./admin-contracts.js";
import type { EventLogInput, EventLogRecord } from "./log.js";
import type { EventDeliveryBoundary, EventDeliveryLedgerRecord } from "./delivery-types.js";
import type { EventDeliveryRecord } from "./router-records.js";

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

export interface EventRouterTrigger {
  readonly id: string;
  readonly targetFunctionId?: string;
  readonly selector?: JsonValue;
  readonly expansion: readonly string[];
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly invoke: (envelope: UnknownEventEnvelope) => Promise<unknown>;
}

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

export interface EventRouterRouteOptions {
  readonly run?: boolean;
}

export interface EventRouterSnapshot {
  readonly records: readonly EventDeliveryRecord[];
  readonly contracts: readonly EventContractInput[];
  readonly triggers: readonly EventTriggerSnapshot[];
  readonly publications: readonly EventLogRecord[];
  readonly deliveries: readonly EventDeliveryLedgerRecord[];
}

export interface EventTriggerSnapshot {
  readonly id: string;
  readonly targetFunctionId?: string;
  readonly selector?: JsonValue;
  readonly expansion: readonly string[];
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}

export interface EventFanoutResult {
  readonly event: UnknownEventEnvelope;
  readonly matchedTriggerIds: readonly string[];
  readonly deliveries: readonly EventDeliveryResult[];
}

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

export type EventRouterInput = EventLogRecord | EventLogInput;
