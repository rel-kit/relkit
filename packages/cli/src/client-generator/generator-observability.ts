import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type {
  GeneratorOperation,
  GeneratorTelemetryService,
} from "./generator-observability.types.js";
export type {
  GeneratorOperation,
  GeneratorTelemetryService,
} from "./generator-observability.types.js";
/** Injectable generator tracing and metrics.
 * @example Effect.provide(schemaTypeEffect({ type: "string" }), GeneratorTelemetryLive);
 */
export class GeneratorTelemetry extends Context.Service<
  GeneratorTelemetry,
  GeneratorTelemetryService
>()("relkit/client-generator/GeneratorTelemetry") {}
/** Live generator telemetry using Effect spans, counters, and duration histograms.
 * @returns A Layer providing GeneratorTelemetry without external requirements.
 * @example Effect.runSync(Effect.provide(schemaTypeEffect({ type: "string" }), GeneratorTelemetryLive));
 */
export const GeneratorTelemetryLive = Layer.succeed(GeneratorTelemetry, { observe: observeLive });
const calls = Metric.counter("relkit_client_generator_operations_total", { incremental: true });
const failures = Metric.counter("relkit_client_generator_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_client_generator_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});
/** Adds telemetry while preserving the operation's Effect channels.
 * @param operation - Static bounded label and span suffix.
 * @param effect - Generator work.
 * @returns The same success and failure channels with telemetry.
 * @example observeGenerator("schemaType", Effect.succeed("string"));
 */
export function observeGenerator<A, E, R>(
  operation: GeneratorOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(GeneratorTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}
/** Records operation count, elapsed duration, and failure without changing Effect channels.
 * @param operation - Static bounded label and span suffix.
 * @param effect - Generator work to observe.
 * @returns An Effect preserving the original success, failure, and requirements.
 * @example observeLive("schemaType", Effect.succeed("string"));
 */
function observeLive<A, E, R>(
  operation: GeneratorOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const elapsed = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
        if (Exit.isFailure(exit))
          yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
      }),
    );
  });
}
/** Runs a synchronous compatibility adapter and preserves typed failures.
 * @param effect - Fully provided synchronous generator Effect.
 * @returns The generated value.
 * @throws The typed error or defect when execution fails.
 * @example runGenerator(Effect.succeed("string"));
 */
export function runGenerator<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
