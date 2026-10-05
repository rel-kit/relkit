import { Cause, Effect, Exit, Tracer } from "effect";

const tracers = new WeakMap<Tracer.Tracer, Tracer.Tracer>();

/**
 * Protects configured tracers without changing authoritative workflow exits.
 * @typeParam A - Private success value.
 * @typeParam E - Original failure.
 * @typeParam R - Caller services.
 * @param effect - Specialized workflow including its named descendant spans.
 * @returns Work using a tracer that receives only bounded diagnostic exits.
 */
export function redactSpecializedTrace<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.flatMap(Tracer.Tracer, (tracer) =>
    effect.pipe(Effect.provideService(Tracer.Tracer, specializedTracer(tracer))),
  );
}

/**
 * Adapts span completion before an external exporter can inspect native causes.
 * @param tracer - Configured backend, retaining IDs, timing and parenting.
 * @returns Cached adapter; native success data and exception stacks stay private.
 */
export function specializedTracer(tracer: Tracer.Tracer): Tracer.Tracer {
  const existing = tracers.get(tracer);
  if (existing !== undefined) return existing;
  const protectedTracer = Tracer.make({
    ...(tracer.context === undefined ? {} : { context: tracer.context.bind(tracer) }),
    span(options) {
      const span = tracer.span(options);
      return new Proxy(span, {
        get(target, key) {
          if (key === "end")
            return (time: bigint, exit: Exit.Exit<unknown, unknown>) => {
              const diagnostic = Exit.isSuccess(exit)
                ? Exit.void
                : Exit.failCause(
                    Cause.fromReasons(
                      exit.cause.reasons.map((reason) =>
                        reason._tag === "Fail"
                          ? Cause.makeFailReason(new Error("Specialized operation failed"))
                          : reason._tag === "Die"
                            ? Cause.makeDieReason(new Error("Specialized operation defect"))
                            : Cause.makeInterruptReason(reason.fiberId),
                      ),
                    ),
                  );
              target.end(time, diagnostic);
            };
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  });
  tracers.set(tracer, protectedTracer);
  tracers.set(protectedTracer, protectedTracer);
  return protectedTracer;
}
