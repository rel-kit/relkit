import type { UnknownEventEnvelope } from "@relkit/events";
import type { InvocationParent } from "./invoke-types.js";
import type { EventEngine, EventInvocationContext } from "./materialize-events.js";

export function invokeEventFunction(
  functionId: string,
  envelope: UnknownEventEnvelope,
  context: EventInvocationContext,
  engine: EventEngine,
): Promise<unknown> {
  const { replayed = false, ...invokeContext } = context;
  const parent: InvocationParent | undefined = envelope.causationInvocationId
    ? {
        id: envelope.causationInvocationId,
        traceId: envelope.traceId,
        ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
        ...(context.deadlineMs === undefined ? {} : { deadlineMs: context.deadlineMs }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      }
    : undefined;
  return engine.invoke({
    ...invokeContext,
    functionId,
    input: envelope.payload,
    source: replayed ? "event-replay" : "event-delivery",
    ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
    traceId: envelope.traceId,
    trigger: Object.freeze({
      kind: "event",
      event: Object.freeze({
        id: envelope.eventId,
        version: envelope.version,
        instanceId: envelope.instanceId,
        occurredAt: envelope.occurredAt,
        publishedAt: envelope.publishedAt,
        ...(envelope.key === undefined ? {} : { key: envelope.key }),
        attributes: envelope.attributes,
      }),
      delivery: Object.freeze({ attempt: context.attempt ?? 1, replayed }),
      trace: Object.freeze({
        traceId: envelope.traceId,
        ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
        ...(envelope.causationInvocationId === undefined
          ? {}
          : { causationInvocationId: envelope.causationInvocationId }),
      }),
    }),
    ...(context.deadlineMs === undefined ? {} : { deadlineMs: context.deadlineMs }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    ...(parent === undefined ? {} : { parent }),
  });
}
