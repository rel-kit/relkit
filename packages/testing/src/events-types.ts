import type {
  DependencyClientSources,
  EventInvocationOptions,
  InvocationHooks,
  InvocationTarget,
} from "@relkit/engine";
import type {
  EventClient,
  EventDescriptorAny,
  EventProvider,
  EventPublishResult,
  UnknownEventEnvelope,
} from "@relkit/events";
import type { JsonValue } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs";
import type { EventDeliveryResult, EventDeliveryLedgerRecord } from "@relkit/providers-local";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { TestFailureControls } from "./fakes.js";
import type { TestClock } from "./runtime.js";

export interface TestEventTriggerOptions<Output = unknown> {
  readonly id: string;
  readonly target: InvocationTarget<UnknownEventEnvelope, Output>;
  readonly delivery?: "ephemeral" | "durable";
  readonly selector?: JsonValue;
  readonly expansion?: readonly string[];
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}

export interface TestEventOptions<Payload = unknown, Output = unknown> {
  readonly event?: EventDescriptorAny;
  readonly eventId?: string;
  readonly version?: number;
  readonly payloadSchema?: StandardSchemaV1;
  readonly target?: InvocationTarget<UnknownEventEnvelope, Output>;
  readonly triggers?: readonly TestEventTriggerOptions<Output>[];
  readonly triggerId?: string;
  readonly delivery?: "ephemeral" | "durable";
  readonly selector?: JsonValue;
  readonly expansion?: readonly string[];
  readonly profile?: string;
  readonly ownerId?: string;
  readonly correlationId?: string;
  readonly causationInvocationId?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly stateRoot?: string;
  readonly startTimeMs?: number;
  readonly leaseDurationMs?: number;
  readonly ephemeralCapacity?: number;
  readonly random?: () => number;
  readonly randomValues?: readonly number[];
  readonly failures?: TestFailureControls;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly hooks?: InvocationHooks;
}

export interface TestEventCloseOptions {
  readonly failed?: boolean;
}

export interface TestEventDeliveryAttempt extends EventDeliveryResult {
  readonly envelope: UnknownEventEnvelope;
}

export interface TestEventFake<Payload = unknown, Output = unknown> extends EventClient<
  Payload,
  string,
  number,
  Payload
> {
  readonly id: string;
  readonly eventId: string;
  readonly version: number;
  readonly client: EventClient<Payload, string, number, Payload>;
  readonly provider: EventProvider;
  readonly stateRoot: string;
  readonly clock: TestClock;
  readonly failures: TestFailureControls;
  readonly pending: (triggerId?: string) => number;
  readonly runNext: (triggerId?: string) => Promise<EventDeliveryResult | undefined>;
  readonly drain: () => Promise<readonly EventDeliveryResult[]>;
  readonly completed: (triggerId?: string) => number;
  readonly restart: () => Promise<void>;
  readonly envelopes: readonly UnknownEventEnvelope[];
  readonly attempts: readonly TestEventDeliveryAttempt[];
  readonly deliveries: readonly EventDeliveryLedgerRecord[];
  readonly close: (options?: TestEventCloseOptions) => Promise<void>;
}

export type TestEventPublishResult = EventPublishResult<string, number, unknown>;
export type TestEventInvocation = EventInvocationOptions;
