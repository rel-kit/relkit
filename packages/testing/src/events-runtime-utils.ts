import {
  invoke,
  type EventInvocationOptions,
  type InvocationIdSource,
  type InvocationTarget,
} from "@zsys/engine";
import { canonicalJson } from "@zsys/contracts";
import type { UnknownEventEnvelope } from "@zsys/events";
import type { EventRouter } from "@zsys/providers-local";
import type { InvocationRunner } from "@zsys/runtime-effect";
import type { TestFailureControls } from "./fakes.js";
import type { TestEventOptions } from "./events-types.js";

export function toEnvelope(value: Record<string, unknown>): UnknownEventEnvelope {
  return JSON.parse(canonicalJson(value)) as UnknownEventEnvelope;
}

export function createEventInvoker(
  targets: ReadonlyMap<string, InvocationTarget<UnknownEventEnvelope, unknown>>,
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
      source: "event",
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
  ephemeralCompleted: Map<string, number>,
  failures: TestFailureControls,
): Promise<void> {
  const result = await router.route(envelope, { run: false });
  unfanned.delete(envelope.instanceId);
  for (const delivery of result.deliveries) {
    if (delivery.delivery === "ephemeral" && delivery.status === "completed")
      ephemeralCompleted.set(
        delivery.triggerId,
        (ephemeralCompleted.get(delivery.triggerId) ?? 0) + 1,
      );
  }
  failures.check("event.after-fan-out");
}
