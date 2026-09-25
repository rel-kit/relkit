import { Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { ExecutionContext, SpanContext, RelkitSpan } from "./execution-context.types.js";

export type { ExecutionContext } from "./execution-context.types.js";

/** Converts one span to its propagation context through Effect.
 * @param span - Span whose trace identity is propagated.
 * @returns An immutable propagation context; no expected Effect failure.
 * @example Effect.runSync(spanContextEffect(span));
 */
export function spanContextEffect(span: RelkitSpan): Effect.Effect<SpanContext> {
  return observeInvocation(
    "span.context",
    Effect.sync(() =>
      Object.freeze({
        traceId: span.traceId,
        spanId: span.spanId,
        traceFlags: span.sampled ? 1 : 0,
        ...(span.traceState === undefined ? {} : { traceState: span.traceState }),
      }),
    ),
  );
}

/** Synchronous span propagation compatibility adapter.
 * @param span - Span whose trace identity is propagated.
 * @returns An immutable propagation context.
 * @example spanContext(span);
 */
export function spanContext(span: RelkitSpan): SpanContext {
  return runInvocationSync(spanContextEffect(span));
}
