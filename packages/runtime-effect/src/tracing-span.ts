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

/** Effect adapter for the invocation-owned span lifecycle and ambient carrier. */
export function createRelkitTracer(
  ids: Pick<IdSourceService, "next">,
  observer?: SpanLifecycleObserver,
  runtime = new SpanRuntime({ ids, ...(observer ? { observer } : {}) }),
): EffectTracer.Tracer {
  const tracer: EffectTracer.Tracer = EffectTracer.make({
    span: (options) => runtime.start(options),
    context(primitive, fiber) {
      const span = fiber.currentSpan;
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
