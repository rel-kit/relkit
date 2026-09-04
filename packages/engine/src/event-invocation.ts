import { parseTracePropagation } from "@relkit/contracts";
import { runDetachedExecution } from "@relkit/invocation";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventEngine, EventInvocationContext } from "./materialize-events.js";

export function invokeEventFunction(
  functionId: string,
  envelope: UnknownEventEnvelope,
  context: EventInvocationContext,
  engine: EventEngine,
): Promise<unknown> {
  const { replayed = false, ...invokeContext } = context;
  const propagation = parseTracePropagation(envelope.propagation);
  return runDetachedExecution(() =>
    engine.invoke({
      ...invokeContext,
      functionId,
      input: envelope.payload,
      source: replayed ? "event-replay" : "event-delivery",
      ...(propagation?.correlationId === undefined
        ? {}
        : { correlationId: propagation.correlationId }),
      ...(propagation?.originRequestId === undefined
        ? {}
        : { originRequestId: propagation.originRequestId }),
      ...(propagation === undefined ? {} : { links: [propagation.producer] }),
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
          ...(propagation === undefined
            ? {}
            : {
                producerTraceId: propagation.producer.traceId,
                producerSpanId: propagation.producer.spanId,
              }),
          ...(propagation?.correlationId === undefined
            ? {}
            : { correlationId: propagation.correlationId }),
          ...(propagation?.invocationId === undefined
            ? {}
            : { causationInvocationId: propagation.invocationId }),
        }),
      }),
      ...(context.deadlineMs === undefined ? {} : { deadlineMs: context.deadlineMs }),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    }),
  );
}
