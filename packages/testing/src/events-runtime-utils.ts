import {
  invoke,
  type EventInvocationOptions,
  type InvocationIdSource,
  type InvocationTarget,
} from "@relkit/engine";
import { canonicalJson, type MaybePromise } from "@relkit/contracts";
import { Clock, Effect } from "effect";
import type { DeterministicClockService } from "./runtime-clock.types.js";
import {
  completeSpanEffect,
  runInExecutionContext,
  SpanRuntime,
  startRootSpanEffect,
} from "@relkit/invocation";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventRouter } from "@relkit/providers-local";
import type { InvocationRunner } from "@relkit/runtime-effect";
import type { TestFailureControls } from "./fakes.js";
import type { TestEventOptions } from "./events-types.js";
import { combineSignals } from "./runtime-clock.js";

/**
 * Detaches an event envelope through the existing canonical JSON authority.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns The canonical native envelope.
 */
export function toEnvelope(value: Record<string, unknown>): UnknownEventEnvelope {
  return JSON.parse(canonicalJson(value)) as UnknownEventEnvelope;
}

/**
 * Binds event producer spans to deterministic native invocation identities.
 * @param eventId - Declared event identity.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @param clock - Owner-local clock used for producer span start and completion.
 * @param ids - Owner-local deterministic trace and span identity source.
 * @returns A trace bridge retaining correlation and causation context.
 */
export function createEventTraceBridge(
  eventId: string,
  options: Pick<TestEventOptions<unknown, unknown>, "correlationId" | "causationInvocationId">,
  clock: DeterministicClockService,
  ids: InvocationIdSource,
) {
  return {
    run: async <A>(
      operation: () => MaybePromise<A>,
      bridgeOptions?: { readonly name?: string },
    ): Promise<A> => {
      const runtime = new SpanRuntime({
        ids,
      });
      const span = Effect.runSync(
        Effect.provideService(
          startRootSpanEffect(
            runtime,
            bridgeOptions?.name ?? `relkit.event.${eventId}.publish`,
            "producer",
          ),
          Clock.Clock,
          clock.service,
        ),
      );
      let failure: unknown;
      try {
        return await runInExecutionContext(
          {
            span,
            runtime,
            ...(options.correlationId === undefined
              ? {}
              : { correlationId: options.correlationId }),
            ...(options.causationInvocationId === undefined
              ? {}
              : { invocationId: options.causationInvocationId }),
          },
          operation,
        );
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        Effect.runSync(
          Effect.provideService(completeSpanEffect(span, failure), Clock.Clock, clock.service),
        );
      }
    },
  };
}

/**
 * Binds native event invocation to deterministic dependencies and cancellation.
 * @param targets - Native targets indexed by declared function identity.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @param now - Injected current time in milliseconds.
 * @param runner - Injected Effect invocation runner.
 * @param idSource - Owner-local native identity source.
 * @param ownerSignal - Getter for this owner's current cancellation generation.
 * @returns An engine invocation callback preserving the native event request fields.
 */
export function createEventInvoker(
  targets: ReadonlyMap<string, InvocationTarget<unknown, unknown>>,
  options: TestEventOptions<unknown, unknown>,
  now: () => number,
  runner: InvocationRunner,
  idSource: InvocationIdSource,
  ownerSignal?: () => AbortSignal,
): (request: EventInvocationOptions) => Promise<unknown> {
  return async (request) => {
    const target = targets.get(request.functionId);
    if (target === undefined) throw new Error(`Unknown test event target ${request.functionId}`);
    const signals = combineSignals(request.signal, ownerSignal?.());
    try {
      return await invoke({
        target,
        input: request.input,
        source: request.source,
        trigger: request.trigger,
        ...(request.attempt === undefined ? {} : { attempt: request.attempt }),
        ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
        ...(request.originRequestId === undefined
          ? {}
          : { originRequestId: request.originRequestId }),
        ...(request.links === undefined ? {} : { links: request.links }),
        ...(request.deadlineMs === undefined ? {} : { deadlineMs: request.deadlineMs }),
        signal: signals.signal,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.clients === undefined ? {} : { clients: options.clients }),
        ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
        now,
        effectRunner: runner,
        idSource,
      });
    } finally {
      signals.dispose();
    }
  };
}

/**
 * Routes a persisted publication before removing its acknowledgement-gap marker.
 * @param router - Acquired native event router.
 * @param envelope - Canonical persisted event envelope.
 * @param unfanned - Owner-local persisted publications awaiting successful fanout.
 * @param failures - Owner-local named failure injection authority.
 * @returns Completion after native fanout; the post-fanout failure boundary remains observable.
 */
export function fanoutEvent(
  router: EventRouter,
  envelope: UnknownEventEnvelope,
  unfanned: Map<string, UnknownEventEnvelope>,
  failures: TestFailureControls,
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => router.route(envelope, { run: false }),
      catch: (cause) => cause,
    });
    unfanned.delete(envelope.instanceId);
    yield* Effect.try({
      try: () => failures.check("event.after-fan-out"),
      catch: (cause) => cause,
    });
  });
}
