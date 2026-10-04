import type { materializeEvents, InvocationIdSource } from "@relkit/engine";
import type { Effect } from "effect";
import type { WorkOwnershipState } from "./work-ownership.types.js";
import type { UnknownEventEnvelope } from "@relkit/events";

import type { InvocationRunner } from "@relkit/runtime-effect";
import type { createDeterministicClock } from "./runtime-clock.js";

import type { TestFailureControls } from "./fakes.js";
import type { TestStateRoot } from "./state-root.js";

import type { openTestEventRuntime } from "./events-runtime-open.js";

import type {
  TestEventDeliveryAttempt,
  TestEventOptions,
  TestEventTriggerOptions,
} from "./events-types.js";

/**
 * Normalized event trigger identity, delivery policy and native target.
 * @typeParam Output - Output validated by the native target schema.
 */
export type TestTrigger<Output> = TestEventTriggerOptions<Output> & {
  readonly delivery: "ephemeral" | "durable";
  readonly profile: string;
  readonly eventId: string;
  readonly eventVersion: number;
};

/** Native generation acquired by the event owner's ordered Effect workflow. */
export type OpenedEventRuntime = Effect.Success<ReturnType<typeof openTestEventRuntime>>;

/** All publication, fanout and admission state belongs to one event owner. */
export interface EventRuntimeState extends WorkOwnershipState {
  readonly envelopes: UnknownEventEnvelope[];
  readonly attempts: TestEventDeliveryAttempt[];
  readonly unfanned: Map<string, UnknownEventEnvelope>;
  generation: number;
  sequence: number;
}

/**
 * Dependencies required to acquire one event log/router generation.
 * @typeParam Payload - Payload accepted by the native event publication schema.
 * @typeParam Output - Output validated by the native target schema.
 */
export interface TestEventRuntimeOptions<Payload, Output> {
  readonly eventId: string;
  readonly version: number;
  readonly profile: string;
  readonly triggers: readonly TestTrigger<Output>[];
  readonly plan: Parameters<typeof materializeEvents>[0]["plan"];
  readonly owner: TestStateRoot;
  readonly deterministic: ReturnType<typeof createDeterministicClock>;
  readonly failures: TestFailureControls;
  readonly random: () => number;
  readonly runner: InvocationRunner;
  readonly idSource: InvocationIdSource;
  readonly options: TestEventOptions<Payload, Output>;
}
