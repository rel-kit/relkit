import { isSpanId, isTraceId } from "@relkit/contracts";
import { Context, Effect, Layer, Option } from "effect";
import { currentExecutionContext } from "./dispatcher-scope.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { TraceContextReaderService, TracePropagation } from "./trace-propagation.types.js";

/** Substitutable reader for the active execution context.
 * @example Effect.provide(currentTracePropagationEffect(), TraceContextReaderLive);
 */
export class TraceContextReader extends Context.Service<TraceContextReader, TraceContextReaderService>()(
  "relkit/invocation/TraceContextReader",
) {}

/** Live reader backed by the invocation execution scope.
 * @example Effect.runSync(Effect.provide(currentTracePropagationEffect(), TraceContextReaderLive));
 */
export const TraceContextReaderLive = Layer.succeed(TraceContextReader, {
  current: currentExecutionContext,
});

/** Builds safe trace propagation data from the current Effect scope.
 * @returns Propagation data or undefined when the span identity is invalid.
 * @example Effect.runSync(currentTracePropagationEffect());
 */
export function currentTracePropagationEffect(): Effect.Effect<TracePropagation | undefined> {
  return observeInvocation(
    "trace.propagation",
    Effect.flatMap(Effect.serviceOption(TraceContextReader), (provided) =>
      Effect.sync(() => {
        const context = Option.isSome(provided)
          ? provided.value.current()
          : currentExecutionContext();
        if (!context || !isTraceId(context.span.traceId) || !isSpanId(context.span.spanId))
          return undefined;
        return Object.freeze({
          version: 2 as const,
          producer: Object.freeze({
            traceId: context.span.traceId,
            spanId: context.span.spanId,
            traceFlags: context.span.sampled ? 1 : 0,
          }),
          ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
          ...(context.originRequestId === undefined ? {} : { originRequestId: context.originRequestId }),
          ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
          ...(context.invocationId === undefined ? {} : { invocationId: context.invocationId }),
        });
      }),
    ),
  );
}

/** Synchronous trace propagation compatibility adapter.
 * @returns Propagation data or undefined when no valid span is active.
 * @example currentTracePropagation();
 */
export function currentTracePropagation(): TracePropagation | undefined {
  return runInvocationSync(currentTracePropagationEffect());
}
