import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import { DiagnosticValidationError } from "./diagnostic-error.js";
import type {
  DiagnosticOperation,
  DiagnosticTelemetryService,
} from "./diagnostic-observability.types.js";
import { DiagnosticSourceError } from "./reporter-source.js";

export type {
  DiagnosticOperation,
  DiagnosticTelemetryService,
} from "./diagnostic-observability.types.js";

/** Injectable telemetry boundary for diagnostic operations.
 * @example Effect.provide(createDiagnosticEffect(input), DiagnosticTelemetryLive);
 */
export class DiagnosticTelemetry extends Context.Service<
  DiagnosticTelemetry,
  DiagnosticTelemetryService
>()("relkit/diagnostics/DiagnosticTelemetry") {}

/** Live Effect metrics and spans for diagnostic operations.
 * @example Effect.runSync(Effect.provide(createDiagnosticEffect(input), DiagnosticTelemetryLive));
 */
export const DiagnosticTelemetryLive = Layer.succeed(DiagnosticTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_diagnostic_operations_total", { incremental: true });
const failures = Metric.counter("relkit_diagnostic_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_diagnostic_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Observes a named operation with a substitutable service.
 * @param operation - Fixed operation name.
 * @param effect - Operation to measure.
 * @returns The original success or error with span and metrics.
 * @example observeDiagnostic("create", Effect.succeed(value));
 */
export function observeDiagnostic<A, E, R>(
  operation: DiagnosticOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(DiagnosticTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: DiagnosticOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.withSpan(
    Effect.gen(function* () {
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
    }),
    `diagnostics.${operation}`,
  );
}

/** Runs a synchronous compatibility adapter and preserves its error message.
 * @param effect - Fully provided Effect operation.
 * @returns The successful value.
 * @throws TypeError for invalid input, the original source provider error, or a defect.
 * @example runDiagnostic(Effect.succeed("ok"));
 */
export function runDiagnostic<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (error instanceof DiagnosticValidationError) {
    throw new TypeError(error.message);
  }
  if (error instanceof DiagnosticSourceError) throw error.cause;
  throw error;
}
