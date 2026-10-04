import type {
  DependencyClientSources,
  EventInvocationOptions,
  InvocationHooks,
} from "@relkit/engine";
import type {
  EventClient,
  EventDescriptorAny,
  EventFunctionDescriptorAny,
  EventProvider,
  EventPublishResult,
  UnknownEventEnvelope,
} from "@relkit/events";

import type { RetryPolicy } from "@relkit/jobs/legacy";
import type { EventDeliveryResult, EventDeliveryLedgerRecord } from "@relkit/providers-local";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { TestFailureControls } from "./fakes.js";
import type { TestClock } from "./runtime.js";

/**
 * Native target and per-trigger delivery, retry and worker concurrency policy.
 * @typeParam Output - Output validated by the native target schema.
 */
export interface TestEventTriggerOptions<Output = unknown> {
  readonly id: string;
  readonly target: EventFunctionDescriptorAny;
  readonly delivery?: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
}

/**
 * Event publication contract, native consumers and deterministic fixture dependencies.
 * @typeParam Payload - Payload accepted by the native event publication schema.
 * @typeParam Output - Output validated by the native target schema.
 */
export interface TestEventOptions<Payload = unknown, Output = unknown> {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly event?: EventDescriptorAny;
  readonly events?: readonly EventDescriptorAny[];
  readonly eventId?: string;
  readonly version?: number;
  readonly payloadSchema?: StandardSchemaV1;
  readonly target?: EventFunctionDescriptorAny;
  readonly triggers?: readonly TestEventTriggerOptions<Output>[];
  readonly triggerId?: string;
  readonly delivery?: "ephemeral" | "durable";
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

/** Explicit failed-test state retention policy for event shutdown. */
export interface TestEventCloseOptions {
  readonly failed?: boolean;
}

/** Native delivery outcome paired with its canonical persisted event envelope. */
export interface TestEventDeliveryAttempt extends EventDeliveryResult {
  readonly envelope: UnknownEventEnvelope;
}

/**
 * Owned native publication/delivery facade with truthful deterministic ledgers.
 * @typeParam Payload - Payload accepted by the native event publication schema.
 * @typeParam Output - Output validated by the native target schema.
 */
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

/** Native accepted publication receipt retained by the public event fixture. */
export type TestEventPublishResult = EventPublishResult<string, number, unknown>;

/** Native invocation request consumed by an event target fixture. */
export type TestEventInvocation = EventInvocationOptions;

/**
 * Validated event trigger identity and policy used by native materialization.
 * @typeParam Output - Output validated by the native target schema.
 */
export type NormalizedTrigger<Output> = TestEventTriggerOptions<Output> & {
  readonly delivery: "ephemeral" | "durable";
  readonly profile: string;
  readonly eventId: string;
  readonly eventVersion: number;
};
