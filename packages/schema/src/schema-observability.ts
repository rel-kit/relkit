import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { SchemaOperation, SchemaTelemetryService } from "./schema-observability.types.js";

export type { SchemaOperation, SchemaTelemetryService } from "./schema-observability.types.js";

/**
 * Injectable observer for schema operation spans and metrics.
 * @example Effect.provide(validateEffect(z.string(), "ok"), SchemaTelemetryLive);
 */
export class SchemaTelemetry extends Context.Service<SchemaTelemetry, SchemaTelemetryService>()(
  "relkit/schema/SchemaTelemetry",
) {}

/**
 * Live schema telemetry based on Effect spans, Clock, and Metric.
 * @example Effect.runSync(Effect.provide(validateSyncEffect(z.string(), "ok"), SchemaTelemetryLive));
 */
export const SchemaTelemetryLive = Layer.succeed(SchemaTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_schema_operations_total", { incremental: true });
const failures = Metric.counter("relkit_schema_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_schema_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/**
 * Instruments a schema operation with bounded metric labels.
 * @param operation - Stable operation name.
 * @param effect - Operation to execute.
 * @returns The unchanged Effect success and error channels, with telemetry.
 * @example observeSchema("json-schema", Effect.succeed({ ok: true }));
 */
export function observeSchema<A, E, R>(
  operation: SchemaOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(SchemaTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: SchemaOperation,
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
    `schema.${operation}`,
  );
}

/**
 * Runs a fully provided synchronous Effect and preserves its failure.
 * @param effect - Effect to execute.
 * @returns The successful value.
 * @throws The original cause on failure.
 * @example runSchemaSync(Effect.succeed(1));
 */
export function runSchemaSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
