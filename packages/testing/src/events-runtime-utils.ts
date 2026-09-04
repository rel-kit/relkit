import {
  invoke,
  type EventInvocationOptions,
  type InvocationIdSource,
  type InvocationTarget,
} from "@relkit/engine";
import { canonicalJson, createSpanId, createTraceId, type MaybePromise } from "@relkit/contracts";
import {
  completeSpan,
  runInExecutionContext,
  SpanRuntime,
  startRootSpan,
} from "@relkit/invocation";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventRouter } from "@relkit/providers-local";
import type { InvocationRunner } from "@relkit/runtime-effect";
import type { TestFailureControls } from "./fakes.js";
import type { TestEventOptions } from "./events-types.js";

export function toEnvelope(value: Record<string, unknown>): UnknownEventEnvelope {
  return JSON.parse(canonicalJson(value)) as UnknownEventEnvelope;
}

export function createEventTraceBridge(
  eventId: string,
  options: Pick<TestEventOptions<unknown, unknown>, "correlationId" | "causationInvocationId">,
) {
  return {
    run: async <A>(
      operation: () => MaybePromise<A>,
      bridgeOptions?: { readonly name?: string },
    ): Promise<A> => {
      const runtime = new SpanRuntime({
        ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      });
      const span = startRootSpan(
        runtime,
        bridgeOptions?.name ?? `relkit.event.${eventId}.publish`,
        "producer",
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
        completeSpan(span, failure);
      }
    },
  };
}

export function createEventInvoker(
  targets: ReadonlyMap<string, InvocationTarget<unknown, unknown>>,
  options: TestEventOptions<unknown, unknown>,
  now: () => number,
  runner: InvocationRunner,
  idSource: InvocationIdSource,
): (request: EventInvocationOptions) => Promise<unknown> {
  return (request) => {
    const target = targets.get(request.functionId);
    if (target === undefined) throw new Error(`Unknown test event target ${request.functionId}`);
    return invoke({
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
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.clients === undefined ? {} : { clients: options.clients }),
      ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
      now,
      effectRunner: runner,
      idSource,
    });
  };
}

export async function fanoutEvent(
  router: EventRouter,
  envelope: UnknownEventEnvelope,
  unfanned: Map<string, UnknownEventEnvelope>,
  failures: TestFailureControls,
): Promise<void> {
  await router.route(envelope, { run: false });
  unfanned.delete(envelope.instanceId);
  failures.check("event.after-fan-out");
}
