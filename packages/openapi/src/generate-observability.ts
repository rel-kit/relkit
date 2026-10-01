import { Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type {
  OpenApiOperationName,
  OpenApiTelemetryService,
} from "./generate-observability.types.js";

/** Replaceable OpenAPI operation observer.
 * @example Effect.provide(generateOpenApiEffect(graph), OpenApiTelemetryLive);
 */
export class OpenApiTelemetry extends Context.Service<OpenApiTelemetry, OpenApiTelemetryService>()(
  "relkit/openapi/OpenApiTelemetry",
) {}

/** Default span and metric observer for OpenAPI operations.
 * @example Effect.provide(generateOpenApiEffect(graph), OpenApiTelemetryLive);
 */
export const OpenApiTelemetryLive = Layer.succeed(OpenApiTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_openapi_operations_total", { incremental: true });
const failures = Metric.counter("relkit_openapi_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_openapi_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Observe an operation with an injected or default observer.
 * @param operation - Fixed operation label.
 * @param effect - Work to measure.
 * @returns Observed Effect with the original success and error channels.
 * @example observeOpenApi("path", Effect.succeed("/orders/{id}"));
 */
export function observeOpenApi<A, E, R>(
  operation: OpenApiOperationName,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(OpenApiTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

/** Records duration on success, failure, interruption, and defect. */
function observeLive<A, E, R>(
  operation: OpenApiOperationName,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.withSpan(
    Effect.gen(function* () {
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
    }),
    `openapi.${operation}`,
  );
}
