import { Context, Effect, Exit, Option, Tracer } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { SpanContext, SpanRuntime, RelkitSpan } from "./root-span.types.js";

/** Starts a root span using the Effect clock and an injected span runtime.
 * @param runtime - Span runtime receiving the new root.
 * @param name - Stable span name.
 * @param kind - Span kind for trace transport.
 * @param parent - Optional propagated parent.
 * @param traceId - Optional caller-provided trace identifier.
 * @returns A root span; runtime failures are defects.
 * @example Effect.runSync(startRootSpanEffect(runtime, "http.request", "server"));
 */
export function startRootSpanEffect(
  runtime: SpanRuntime,
  name: string,
  kind: "server" | "producer" | "consumer" | "internal",
  parent?: SpanContext,
  traceId?: string,
): Effect.Effect<RelkitSpan> {
  return observeInvocation(
    "span.root-start",
    Effect.clockWith((clock) =>
      Effect.sync(() => {
        const options: Parameters<Tracer.Tracer["span"]>[0] = {
          name,
          parent:
            parent === undefined
              ? Option.none()
              : Option.some(
                  Tracer.externalSpan({
                    traceId: parent.traceId,
                    spanId: parent.spanId,
                    sampled: (parent.traceFlags & 1) === 1,
                  }),
                ),
          annotations: Context.empty(),
          links: [],
          startTime: BigInt(clock.currentTimeMillisUnsafe()) * 1_000_000n,
          kind,
          root: true,
          sampled: parent === undefined || (parent.traceFlags & 1) === 1,
        };
        return traceId === undefined ? runtime.start(options) : runtime.startRoot(options, traceId);
      }),
    ),
  );
}

/** Synchronous root span compatibility adapter.
 * @param runtime - Span runtime receiving the root.
 * @param name - Stable span name.
 * @param kind - Span kind.
 * @param parent - Optional propagated parent.
 * @param traceId - Optional trace identifier.
 * @returns The new root span.
 * @throws A defect from a failed span runtime.
 * @example startRootSpan(runtime, "http.request", "server");
 */
export function startRootSpan(
  runtime: SpanRuntime,
  name: string,
  kind: "server" | "producer" | "consumer" | "internal",
  parent?: SpanContext,
  traceId?: string,
): RelkitSpan {
  return runInvocationSync(startRootSpanEffect(runtime, name, kind, parent, traceId));
}

/** Completes a span using the Effect clock.
 * @param span - Span to complete.
 * @param error - Optional failure recorded on the span.
 * @returns Completion with no expected Effect failure.
 * @example Effect.runSync(completeSpanEffect(span));
 */
export function completeSpanEffect(span: RelkitSpan, error?: unknown): Effect.Effect<void> {
  return observeInvocation(
    "span.complete",
    Effect.clockWith((clock) =>
      Effect.sync(() => {
        span.end(
          BigInt(clock.currentTimeMillisUnsafe()) * 1_000_000n,
          error === undefined ? Exit.void : Exit.fail(error),
        );
      }),
    ),
  );
}

/** Synchronous span completion compatibility adapter.
 * @param span - Span to complete.
 * @param error - Optional failure recorded on the span.
 * @returns Nothing.
 * @throws A defect from the span runtime.
 * @example completeSpan(span);
 */
export function completeSpan(span: RelkitSpan, error?: unknown): void {
  runInvocationSync(completeSpanEffect(span, error));
}
