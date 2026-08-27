import { materializeEvents, type InvocationIdSource, type InvocationTarget } from "@relkit/engine";
import {
  createEventClient,
  type EventClient,
  type EventProvider,
  type UnknownEventEnvelope,
} from "@relkit/events";
import type { EventDeliveryResult, EventRouter } from "@relkit/providers-local";
import type { InvocationRunner } from "@relkit/runtime-effect";
import { createDeterministicClock } from "./runtime-clock.js";
import type { TestFailureControls } from "./fakes.js";
import type { TestStateRoot } from "./state-root.js";
import { createEventInvoker, fanoutEvent, toEnvelope } from "./events-runtime-utils.js";
import { openTestEventRuntime } from "./events-runtime-open.js";
import { createTestEventControls } from "./events-runtime-controls.js";
import type {
  TestEventDeliveryAttempt,
  TestEventFake,
  TestEventOptions,
  TestEventTriggerOptions,
} from "./events-types.js";

type TestTrigger<Output> = TestEventTriggerOptions<Output> & {
  readonly delivery: "ephemeral" | "durable";
  readonly profile: string;
  readonly expansion: readonly string[];
};
type OpenedEventRuntime = Awaited<ReturnType<typeof openTestEventRuntime>>;

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

export async function createTestEventRuntime<Payload, Output>(
  input: TestEventRuntimeOptions<Payload, Output>,
): Promise<TestEventFake<Payload, Output>> {
  const {
    eventId,
    version,
    profile,
    triggers,
    plan,
    owner,
    deterministic,
    failures,
    random,
    runner,
    idSource,
    options,
  } = input;
  const targets = new Map(
    triggers.map(({ target }) => [
      target.id,
      target as InvocationTarget<UnknownEventEnvelope, unknown>,
    ]),
  );
  const envelopes: UnknownEventEnvelope[] = [];
  const attempts: TestEventDeliveryAttempt[] = [];
  const unfanned = new Map<string, UnknownEventEnvelope>();
  const ephemeralCompleted = new Map<string, number>();
  let log!: OpenedEventRuntime["log"];
  let router!: EventRouter;
  let generation = 0;
  let sequence = 0;
  let traceSequence = 0;
  let closed = false;

  const open = async (): Promise<void> => {
    const opened = await openTestEventRuntime({
      profile,
      plan,
      owner,
      options: options as TestEventOptions<unknown, unknown>,
      now: deterministic.clock.currentTimeMs,
      random,
      failures,
      runner,
      idSource,
      targets,
      generation,
    });
    log = opened.log;
    router = opened.router;
    generation = opened.generation;
    if (envelopes.length === 0)
      envelopes.push(...log.snapshot().records.map(({ envelope }) => envelope));
    sequence = Math.max(sequence, opened.storedCount);
  };
  const provider: EventProvider = {
    publish: async (payload, publishOptions, context) => {
      const timestamp = new Date(deterministic.clock.currentTimeMs()).toISOString();
      const envelope = toEnvelope({
        instanceId: `test-event-${eventId}-${++sequence}`,
        eventId,
        version,
        payload,
        occurredAt: timestamp,
        publishedAt: timestamp,
        traceId: context.traceId,
        attributes: publishOptions.attributes ?? {},
        ...(publishOptions.key === undefined ? {} : { key: publishOptions.key }),
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
        ...(context.causationInvocationId === undefined
          ? {}
          : { causationInvocationId: context.causationInvocationId }),
      });
      const record = await log.append(envelope);
      envelopes.push(record.envelope);
      unfanned.set(record.envelope.instanceId, record.envelope);
      failures.check("event.after-persist-before-fanout");
      await fanoutEvent(router, record.envelope, unfanned, ephemeralCompleted, failures);
      return { accepted: true, ...record.envelope };
    },
  };
  const payloadSchema = options.payloadSchema ?? options.event?.payload;
  const client = createEventClient({
    ownerId: options.ownerId ?? `test-owner-${eventId}`,
    eventId,
    version,
    source: provider,
    profile,
    now: deterministic.clock.now,
    traceId: () => `test-trace-${++traceSequence}`,
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    ...(options.causationInvocationId === undefined
      ? {}
      : { causationInvocationId: options.causationInvocationId }),
    ...(payloadSchema === undefined ? {} : { payloadSchema }),
  }) as unknown as EventClient<Payload, string, number, Payload>;
  await open();

  const controls = createTestEventControls({
    router: () => router,
    log: () => log,
    open,
    owner,
    failures,
    triggers,
    envelopes,
    unfanned,
    ephemeralCompleted,
    openFanout: (envelope) => fanoutEvent(router, envelope, unfanned, ephemeralCompleted, failures),
    remember,
    isClosed: () => closed,
    markClosed: () => (closed = true),
  });
  return Object.freeze({
    ...client,
    ...controls,
    id: eventId,
    eventId,
    version,
    client,
    provider,
    stateRoot: owner.path,
    clock: deterministic.clock,
    failures,
    get envelopes() {
      return Object.freeze([...envelopes]);
    },
    get attempts() {
      return Object.freeze([...attempts]);
    },
    get deliveries() {
      return router.snapshot().deliveries;
    },
  });

  function remember(result: EventDeliveryResult, envelope: UnknownEventEnvelope): void {
    if (result.deliveryId !== undefined) attempts.push(Object.freeze({ ...result, envelope }));
  }
}
