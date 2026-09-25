import { Exit, Tracer } from "effect";
import { isSpanId, isTraceId } from "@relkit/contracts";
import type { RelkitSpan } from "./tracing-span.js";
import { boundedTraceText } from "./trace-limits.js";
import { spanMetadata } from "./span-attributes.js";

/** Completes a span exactly once inside its observed Effect operation.
 * @param span - Span to complete. @param endTime - Monotonic completion time.
 * @param exit - Invocation exit.
 * @returns Void; repeated completion has no effect.
 * @example completeSpan(span, 2n, Exit.void);
 */
export function completeSpan(span: RelkitSpan, endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
  if (span.status._tag === "Ended") return;
  span.status = { _tag: "Ended", startTime: span.startTime, endTime, exit };
  span.revision++;
  span.runtime.active.delete(span);
  span.runtime.notify("completed", span);
}

/** Captures a payload inside its observed Effect operation.
 * @param span - Span to mutate. @param kind - Input or output slot.
 * @param value - Candidate payload.
 * @returns Whether the runtime captured the value.
 * @example captureSpan(span, "input", request);
 */
export function captureSpan(span: RelkitSpan, kind: "input" | "output", value: unknown): boolean {
  const captured = span.runtime.capture(value);
  if (captured === undefined) return false;
  span.captures[kind] = captured;
  return true;
}

/** Records a bounded event as part of an observed span operation.
 * @param span - Span to mutate. @param name - Event name.
 * @param time - Event time. @param attributes - Candidate metadata.
 * @returns Void; the span records any budget overflow.
 * @example recordSpanEvent(span, "received", 2n, { status: 200 });
 */
export function recordSpanEvent(
  span: RelkitSpan,
  name: string,
  time: bigint,
  attributes: Record<string, unknown>,
): void {
  if (span.events.length >= span.runtime.limits.events) {
    span.droppedEvents++;
    return;
  }
  const metadata = spanMetadata(attributes, span.runtime.limits);
  span.events.push(Object.freeze({
    name: boundedTraceText(name, span.runtime.limits.nameBytes),
    time,
    attributes: metadata.attributes,
    droppedAttributes: metadata.dropped,
  }));
}

/** Adds valid span links as part of an observed span operation.
 * @param span - Span to mutate. @param links - Candidate span links.
 * @returns Void; the span records invalid or excess links.
 * @example appendSpanLinks(span, [{ span: parent, attributes: {} }]);
 */
export function appendSpanLinks(span: RelkitSpan, links: ReadonlyArray<Tracer.SpanLink>): void {
  for (const link of links) {
    if (
      span.links.length >= span.runtime.limits.links ||
      !isTraceId(link.span.traceId) ||
      !isSpanId(link.span.spanId)
    ) {
      span.droppedLinks++;
      continue;
    }
    const metadata = spanMetadata(link.attributes, span.runtime.limits);
    span.links.push(Object.freeze({
      span: Tracer.externalSpan({
        traceId: link.span.traceId,
        spanId: link.span.spanId,
        sampled: link.span.sampled,
      }),
      attributes: metadata.attributes,
    }));
    span.droppedAttributes += metadata.dropped;
  }
}
