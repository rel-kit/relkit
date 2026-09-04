import type { SpanLifecycle } from "./span-runtime.js";
import type { SpanCapture } from "./span-runtime.js";

export function spanSnapshot(event: SpanLifecycle) {
  const span = event.span;
  const attributes = Object.fromEntries(span.attributes);
  const text = (key: string): string | undefined =>
    typeof attributes[key] === "string" ? attributes[key] : undefined;
  const outcome = text("relkit.outcome");
  return Object.freeze({
    version: 2 as const,
    signal: "span" as const,
    traceId: span.traceId,
    spanId: span.spanId,
    name: span.name,
    kind: span.kind,
    status: event.type,
    revision: event.revision,
    startedAt: new Date(Number(span.startTime / 1_000_000n)).toISOString(),
    ...(span.parent._tag === "Some" ? { parentSpanId: span.parent.value.spanId } : {}),
    ...(text("relkit.request.id") === undefined ? {} : { requestId: text("relkit.request.id")! }),
    ...(text("relkit.origin_request.id") === undefined
      ? {}
      : { originRequestId: text("relkit.origin_request.id")! }),
    ...(text("relkit.invocation.id") === undefined
      ? {}
      : { invocationId: text("relkit.invocation.id")! }),
    ...(text("relkit.function.id") === undefined
      ? {}
      : { functionId: text("relkit.function.id")! }),
    ...(text("relkit.service.id") === undefined ? {} : { serviceId: text("relkit.service.id")! }),
    ...(text("relkit.correlation.id") === undefined
      ? {}
      : { correlationId: text("relkit.correlation.id")! }),
    ...(text("relkit.invocation.source") === undefined
      ? {}
      : { source: text("relkit.invocation.source")! }),
    ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
    ...(outcome === undefined ? {} : { outcome }),
    ...capture("input", span.captures.input),
    ...capture("output", span.captures.output),
    ...(span.events.length === 0
      ? {}
      : {
          events: span.events.map((item) => ({
            name: item.name,
            timestamp: new Date(Number(item.time / 1_000_000n)).toISOString(),
            attributes: item.attributes,
            droppedAttributes: item.droppedAttributes,
          })),
        }),
    ...(span.links.length === 0
      ? {}
      : {
          links: span.links.map((link) => ({
            traceId: link.span.traceId,
            spanId: link.span.spanId,
            attributes: link.attributes,
          })),
        }),
    ...(text("error.type") === undefined && text("error.message") === undefined
      ? {}
      : {
          error: {
            ...(text("error.type") === undefined ? {} : { type: text("error.type")! }),
            ...(text("error.message") === undefined ? {} : { message: text("error.message")! }),
          },
        }),
    ...(span.status._tag === "Ended"
      ? {
          completedAt: new Date(Number(span.status.endTime / 1_000_000n)).toISOString(),
          durationMs: Number(span.status.endTime - span.startTime) / 1_000_000,
        }
      : {}),
    dropped: {
      attributes: span.droppedAttributes,
      events: span.droppedEvents,
      links: span.droppedLinks,
      updates: span.droppedUpdates,
    },
  });
}

function capture(kind: "input" | "output", value: SpanCapture | undefined) {
  if (value === undefined) return {};
  return { [`${kind}Capture`]: value };
}
