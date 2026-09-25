import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { TelemetryConfiguration, TelemetryExporterMap } from "./telemetry-config.types.js";
import { telemetryConfigCore as core } from "./telemetry-config-core.js";
/**
 * Tagged invalid telemetry configuration or exporter descriptor.
 * @example
 * if (error._tag === "TelemetryConfigError") console.error(error.message);
 */
export class TelemetryConfigError extends Schema.TaggedError<TelemetryConfigError>()(
  "TelemetryConfigError",
  { message: Schema.String },
) {}
function observe<A, E>(
  operation: "descriptor" | "normalize" | "isDescriptor",
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_telemetry_config_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_telemetry_config_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function expected<A>(run: () => A): Effect.Effect<A, TelemetryConfigError> {
  return Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof TypeError
        ? Effect.fail(new TelemetryConfigError({ message: cause.message }))
        : Effect.die(cause),
    ),
  );
}
/**
 * Defines a validated, frozen telemetry exporter descriptor.
 * @param integrationId - Stable integration identifier.
 * @param adapterId - Stable adapter identifier.
 * @param configuration - Serializable adapter configuration.
 * @returns An Effect with the descriptor or tagged validation error.
 * @example
 * const descriptor = Effect.runSync(defineTelemetryExporterEffect("aws", "otlp", {}));
 */
export const defineTelemetryExporterEffect = Effect.fn("ObservabilityTelemetryConfig.descriptor")(
  <IntegrationId extends string, AdapterId extends string, Configuration extends object>(
    integrationId: IntegrationId,
    adapterId: AdapterId,
    configuration: Configuration,
  ) =>
    observe(
      "descriptor",
      expected(() => core.defineTelemetryExporter(integrationId, adapterId, configuration)),
    ),
);
/**
 * Normalizes and validates capture, redaction, retention, sampling, and exporters.
 * @param value - Input telemetry configuration.
 * @returns An Effect with frozen configuration or tagged validation error.
 * @example
 * const config = Effect.runSync(normalizeTelemetryConfigurationEffect({}));
 */
export const normalizeTelemetryConfigurationEffect = Effect.fn(
  "ObservabilityTelemetryConfig.normalize",
)(<Exporters extends TelemetryExporterMap>(value: TelemetryConfiguration<Exporters> = {}) =>
  observe(
    "normalize",
    expected(() => core.normalizeTelemetryConfiguration(value)),
  ),
);
/**
 * Checks whether a value is a valid telemetry exporter descriptor.
 * @param value - Candidate value.
 * @returns An Effect with the descriptor check result.
 * @example
 * const valid = Effect.runSync(isTelemetryExporterDescriptorEffect(value));
 */
export const isTelemetryExporterDescriptorEffect = Effect.fn(
  "ObservabilityTelemetryConfig.isDescriptor",
)((value: unknown) =>
  observe(
    "isDescriptor",
    Effect.sync(() => core.isTelemetryExporterDescriptor(value)),
  ),
);
