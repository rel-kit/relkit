import { Context, Tracer as EffectTracer } from "effect";
import {
  SpanRuntime,
  RelkitSpan,
  currentExecutionContext,
  runInExecutionContext,
  type SpanLifecycleObserver,
} from "@relkit/invocation";
import type { IdSourceService } from "./services.js";
import { InvocationTrace } from "./tracing.js";

export type { SpanLifecycle, SpanLifecycleObserver } from "@relkit/invocation";

/**
 * Adapts the invocation-owned span lifecycle to Effect tracing.
 * @param ids - Generation identifier source.
 * @param observer - Optional isolated span lifecycle observer.
 * @param runtime - Invocation-owned span runtime, created once by default.
 * @returns An Effect tracer using the existing ambient execution carrier.
 */
export function createRelkitTracer(
  ids: Pick<IdSourceService, "next">,
  observer?: SpanLifecycleObserver,
  runtime = new SpanRuntime({ ids, ...(observer ? { observer } : {}) }),
): EffectTracer.Tracer {
  const tracer: EffectTracer.Tracer = EffectTracer.make({
    span: (options) => runtime.start(options),
    /** Re-enters the invocation carrier for one Effect primitive evaluation.
     * @param primitive - Primitive owned by the current Effect run loop.
     * @param fiber - Active fiber containing its span and invocation references.
     * @returns The primitive's unchanged evaluation result.
     */
    context(primitive, fiber) {
      const span = fiber.cache.span;
      if (!(span instanceof RelkitSpan)) return primitive["~effect/Effect/evaluate"](fiber);
      const invocation = Context.get(fiber.context, InvocationTrace);
      return runInExecutionContext(
        {
          ...currentExecutionContext(),
          ...invocation,
          span,
          runtime: span.runtime,
          tracer,
        },
        () => primitive["~effect/Effect/evaluate"](fiber),
      );
    },
  });
  return tracer;
}
