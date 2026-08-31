import {
  invoke,
  type EventInvocationOptions,
  type InvocationIdSource,
  type InvocationTarget,
} from "@relkit/engine";
import { canonicalJson } from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventRouter } from "@relkit/providers-local";
import type { InvocationRunner } from "@relkit/runtime-effect";
import type { TestFailureControls } from "./fakes.js";
import type { TestEventOptions } from "./events-types.js";

export function toEnvelope(value: Record<string, unknown>): UnknownEventEnvelope {
  return JSON.parse(canonicalJson(value)) as UnknownEventEnvelope;
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
      traceId: request.traceId,
      ...(request.parent === undefined ? {} : { parent: request.parent }),
      ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
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
