import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { JsonValue } from "@relkit/contracts";
import type { TelemetryExporterDescriptor } from "./telemetry-config.js";
import type {
  TelemetryExporterFactoryContext,
  TelemetryExporterRuntime,
} from "./telemetry-exporter.types.js";
import { telemetryResolutionCore } from "./telemetry-exporter-resolution-core.js";
/**
 * Tagged exporter metadata, configuration, or runtime factory failure.
 * @example
 * if (error._tag === "TelemetryResolutionError") console.error(error.operation);
 */
export class TelemetryResolutionError extends Schema.TaggedError<TelemetryResolutionError>()(
  "TelemetryResolutionError",
  { operation: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}
function failure(operation: string, cause: unknown): TelemetryResolutionError {
  return new TelemetryResolutionError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
function observe<A>(operation: string, effect: Effect.Effect<A, TelemetryResolutionError>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_telemetry_resolution_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_telemetry_resolution_operation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Validates runtime metadata and returns a cancellable Effect factory.
 * @param descriptor - Exporter identity and protocol version.
 * @param modules - Available runtime modules.
 * @returns An Effect with a factory or a tagged metadata failure.
 * @example
 * const create = Effect.runSync(telemetryExporterFactoryEffect(descriptor, modules));
 */
export const telemetryExporterFactoryEffect = Effect.fn("TelemetryExporter.resolveFactory")(
  (descriptor: TelemetryExporterDescriptor, modules: readonly { readonly module: unknown }[]) =>
    observe(
      "resolveFactory",
      Effect.try({
        try: () => telemetryResolutionCore.telemetryExporterFactory(descriptor, modules),
        catch: (cause) => failure("resolveFactory", cause),
      }),
    ).pipe(
      Effect.map((factory) =>
        Effect.fn("TelemetryExporter.create")((context: TelemetryExporterFactoryContext) =>
          observe(
            "create",
            Effect.tryPromise({
              try: async (signal): Promise<TelemetryExporterRuntime> => {
                const combined =
                  context.signal === undefined ? signal : AbortSignal.any([context.signal, signal]);
                const runtime = await factory({ ...context, signal: combined });
                if (combined.aborted) {
                  await runtime.close?.();
                  throw new DOMException("Telemetry exporter acquisition aborted", "AbortError");
                }
                return runtime;
              },
              catch: (cause) => failure("create", cause),
            }),
          ),
        ),
      ),
    ),
);
/**
 * Resolves exporter bindings in an observed Effect.
 * @param exporter - Exporter name for diagnostics.
 * @param value - Configuration object.
 * @param values - Bound values.
 * @returns An Effect with frozen JSON settings or a tagged resolution error.
 * @example
 * const config = Effect.runSync(resolveTelemetryExporterConfigurationEffect("otlp", {}, {}));
 */
export const resolveTelemetryExporterConfigurationEffect = Effect.fn(
  "TelemetryExporter.resolveConfiguration",
)((exporter: string, value: object, values: Readonly<Record<string, unknown>> = {}) =>
  observe(
    "resolveConfiguration",
    Effect.try({
      try: (): Readonly<Record<string, JsonValue>> =>
        telemetryResolutionCore.resolveTelemetryExporterConfiguration(exporter, value, values),
      catch: (cause) => failure("resolveConfiguration", cause),
    }),
  ),
);
