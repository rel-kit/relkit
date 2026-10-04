import type {
  EventRuntimeState,
  OpenedEventRuntime,
  TestEventRuntimeOptions,
} from "./events-runtime.types.js";
export type { TestEventRuntimeOptions } from "./events-runtime.types.js";
import { type InvocationTarget } from "@relkit/engine";
import {
  createEventClient,
  defineEvent,
  bindFunctionEvents,
  type EventClient,
  type EventProvider,
  type UnknownEventEnvelope,
} from "@relkit/events";
import { z } from "@relkit/schema";
import type { EventDeliveryResult, EventRouter } from "@relkit/providers-local";

import { createEventTraceBridge } from "./events-runtime-utils.js";

import { fanoutEvent, toEnvelope } from "./events-runtime-utils.js";
import { openTestEventRuntime } from "./events-runtime-open.js";
import { createTestEventControls } from "./events-runtime-controls.js";
import { Cause, Effect, Exit, Ref } from "effect";
import type { TestEventFake, TestEventOptions } from "./events-types.js";

/**
 * Builds the native event publication and delivery owner.
 * @typeParam Payload - Event payload accepted by the native publication schema.
 * @typeParam Output - Output validated by the target's native schema.
 * @param input - Declared input passed through the owning schema authority.
 * @returns An event client with deterministic state and complete shutdown controls.
 */
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
  const contract =
    options.event ??
    defineEvent({ id: eventId, version, input: options.payloadSchema ?? z.unknown() });
  const contracts = [contract, ...(options.events ?? [])];
  const targets = new Map(
    triggers.map(({ target }) => [
      target.id,
      bindFunctionEvents(
        target,
        contract,
        contracts.filter((event) => target.publishes?.includes(event.id)),
      ) as unknown as InvocationTarget<unknown, unknown>,
    ]),
  );
  const workState = Ref.makeUnsafe<EventRuntimeState>({
    envelopes: [],
    attempts: [],
    unfanned: new Map(),
    generation: 0,
    sequence: 0,
    closed: false,
    kind: "event",
    controller: new AbortController(),
    pending: new Set(),
  });
  const { envelopes, attempts, unfanned } = Ref.getUnsafe(workState);
  let log!: OpenedEventRuntime["log"];
  let router!: EventRouter;

  let generationOpen = false;
  /**
   * Acquires native router/log state and replays persisted owner identities.
   * @returns Completion after this generation is ready for work admission.
   */
  const open = Effect.fn("Testing.event.open")(function* () {
    const opened = yield* openTestEventRuntime({
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
      generation: Ref.getUnsafe(workState).generation,
      ownerSignal: () => Ref.getUnsafe(workState).controller.signal,
    });
    log = opened.log;
    router = opened.router;
    generationOpen = true;
    Ref.getUnsafe(workState).generation = opened.generation;
    if (envelopes.length === 0)
      envelopes.push(...log.snapshot().records.map(({ envelope }) => envelope));
    Ref.getUnsafe(workState).sequence = Math.max(
      Ref.getUnsafe(workState).sequence,
      opened.storedCount,
    );
  });
  /**
   * Persists a canonical envelope before fanout and its acknowledgement boundaries.
   * @param payload Native schema-validated publication value.
   * @param publishOptions Native attributes and optional partition key.
   * @param context Producer propagation and cancellation inherited from the client.
   * @returns Native accepted publication after successful fanout.
   */
  const publish = (...args: Parameters<EventProvider["publish"]>) =>
    Effect.fn("Testing.event.persistFanout")(function* () {
      const [payload, publishOptions, context] = args;
      if (context.signal.aborted)
        return yield* Effect.fail(context.signal.reason ?? new Error("Event operation cancelled"));
      const timestamp = new Date(deterministic.clock.currentTimeMs()).toISOString();
      const envelope = toEnvelope({
        instanceId: `test-event-${eventId}-${++Ref.getUnsafe(workState).sequence}`,
        eventId,
        version,
        payload,
        occurredAt: timestamp,
        publishedAt: timestamp,
        ...(context.propagation === undefined ? {} : { propagation: context.propagation }),
        attributes: publishOptions.attributes ?? {},
        ...(publishOptions.key === undefined ? {} : { key: publishOptions.key }),
      });
      const record = yield* Effect.tryPromise({
        try: () => log.append(envelope),
        catch: (cause) => cause,
      });
      envelopes.push(record.envelope);
      unfanned.set(record.envelope.instanceId, record.envelope);
      yield* Effect.try({
        try: () => failures.check("event.after-persist-before-fanout"),
        catch: (cause) => cause,
      });
      yield* fanoutEvent(router, record.envelope, unfanned, failures);
      return { accepted: true as const, ...record.envelope };
    })();
  let controls!: Awaited<ReturnType<typeof createTestEventControls>>;
  const provider: EventProvider = { publish: (...args) => controls.publishNative(...args) };
  const payloadSchema = options.payloadSchema ?? options.event?.input;
  const client = createEventClient({
    ownerId: options.ownerId ?? `test-owner-${eventId}`,
    eventId,
    version,
    source: provider,
    profile,
    now: deterministic.clock.now,
    bridge: createEventTraceBridge(eventId, options, deterministic, idSource),
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    ...(options.causationInvocationId === undefined
      ? {}
      : { causationInvocationId: options.causationInvocationId }),
    ...(payloadSchema === undefined ? {} : { payloadSchema }),
  }) as unknown as EventClient<Payload, string, number, Payload>;
  /**
   * Attempts every native generation release and retains the first failure.
   * @returns Completion after router and log close, even when one fails.
   */
  const release = Effect.fn("Testing.event.release")(function* () {
    if (!generationOpen) return;
    generationOpen = false;
    const results = yield* Effect.forEach(
      [() => router.close(), () => log.close()],
      (close) => Effect.exit(Effect.tryPromise({ try: close, catch: (cause) => cause })),
      { concurrency: 1 },
    );
    const failed = results.find(Exit.isFailure);
    if (failed !== undefined) return yield* Effect.fail(Cause.squash(failed.cause));
  })();
  controls = await createTestEventControls({
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    publish,
    router: () => router,
    log: () => log,
    open: open(),
    release,
    work: Ref.getUnsafe(workState),
    owner,
    failures,
    triggers,
    envelopes,
    unfanned,
    openFanout: (envelope) => fanoutEvent(router, envelope, unfanned, failures),
    remember,
  });
  const { publishNative: _publishNative, ...publicControls } = controls;
  return Object.freeze({
    ...client,
    ...publicControls,
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

  /**
   * Records a delivered attempt without fabricating results for absent deliveries.
   * @param result - Native delivered attempt outcome.
   * @param envelope - Canonical persisted event envelope.
   * @returns Nothing; the attempt ledger is updated only for an identified delivery.
   */
  function remember(result: EventDeliveryResult, envelope: UnknownEventEnvelope): void {
    if (result.deliveryId !== undefined) attempts.push(Object.freeze({ ...result, envelope }));
  }
}
