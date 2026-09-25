import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type {
  InvocationOperation,
  InvocationTelemetryService,
} from "./invocation-observability.types.js";

export type {
  InvocationOperation,
  InvocationTelemetryService,
} from "./invocation-observability.types.js";

/** Substitutable telemetry for invocation operations.
 * @example Effect.provide(normalizeErrorRetryEffect("later"), InvocationTelemetryLive);
 */
export class InvocationTelemetry extends Context.Service<
  InvocationTelemetry,
  InvocationTelemetryService
>()("relkit/invocation/InvocationTelemetry") {}

/** Live span and metric observer for invocation operations.
 * @example Effect.runSync(Effect.provide(normalizeErrorRetryEffect("never"), InvocationTelemetryLive));
 */
export const InvocationTelemetryLive = Layer.succeed(InvocationTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_invocation_operations_total", { incremental: true });
const failures = Metric.counter("relkit_invocation_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_invocation_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Observes an operation with a fixed span and bounded metric labels.
 * @param operation - Fixed operation name.
 * @param effect - Operation to observe.
 * @returns The original Effect success and error channels.
 * @example observeInvocation("retry.normalize", Effect.succeed({ retry: "never" }));
 */
export function observeInvocation<A, E, R>(
  operation: InvocationOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const execute = Effect.fn(function* () {
    return yield* effect;
  });
  return Effect.flatMap(Effect.serviceOption(InvocationTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, execute())
      : observeLive(operation, execute()),
  );
}

function observeLive<A, E, R>(
  operation: InvocationOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  const measured = Effect.gen(function* () {
    const started = yield* Clock.monotonicTimeNanos;
    yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
        yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
        if (Exit.isFailure(exit))
          yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
      }),
    );
  });
  return Effect.flatMap(Effect.option(Effect.currentSpan), (current) =>
    Option.isSome(current) && Reflect.get(current.value, "relkitInvocationSpan") === true
      ? measured
      : Effect.withSpan(measured, `invocation.${operation}`),
  );
}

/** Runs a synchronous compatibility adapter while preserving its failure.
 * @param effect - Effect operation with all dependencies available.
 * @returns The successful value.
 * @throws The typed domain failure or an unexpected defect.
 * @example runInvocationSync(Effect.succeed(1));
 */
export function runInvocationSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
