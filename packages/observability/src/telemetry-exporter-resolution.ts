import { Effect } from "effect";
import type { JsonValue } from "@relkit/contracts";
import type { TelemetryExporterDescriptor } from "./telemetry-config.js";
import type {
  TelemetryExporterFactoryContext,
  TelemetryExporterRuntime,
} from "./telemetry-exporter.types.js";
import {
  telemetryExporterFactoryEffect,
  resolveTelemetryExporterConfigurationEffect,
  type TelemetryResolutionError,
} from "./telemetry-exporter-resolution-effect.js";
export {
  TelemetryResolutionError,
  telemetryExporterFactoryEffect,
  resolveTelemetryExporterConfigurationEffect,
} from "./telemetry-exporter-resolution-effect.js";
function legacy(error: TelemetryResolutionError): Error {
  return error.cause instanceof Error ? error.cause : new TypeError(error.message);
}
/**
 * Validates a runtime module and returns a Promise-compatible factory.
 * @param descriptor - Exporter integration and adapter identity.
 * @param modules - Runtime integration modules available for this package.
 * @returns A factory that resolves a validated exporter runtime.
 * @throws {TypeError} If metadata is missing or ambiguous.
 * @example
 * const factory = telemetryExporterFactory(descriptor, modules);
 * const runtime = await factory({ name: "otlp", configuration: {} });
 */
export function telemetryExporterFactory(
  descriptor: TelemetryExporterDescriptor,
  modules: readonly { readonly module: unknown }[],
): (context: TelemetryExporterFactoryContext) => Promise<TelemetryExporterRuntime> {
  const factory = Effect.runSync(
    telemetryExporterFactoryEffect(descriptor, modules).pipe(Effect.mapError(legacy)),
  );
  return (context) => Effect.runPromise(factory(context).pipe(Effect.mapError(legacy)));
}
/**
 * Resolves binding references into frozen JSON-safe exporter settings.
 * @param exporter - Exporter name for diagnostics.
 * @param value - Configuration object.
 * @param values - Bound values supplied by the runtime.
 * @returns Frozen, serialized exporter settings.
 * @throws {TypeError} If a binding is absent or a value is not serializable.
 * @example
 * const config = resolveTelemetryExporterConfiguration("otlp", {}, {});
 */
export function resolveTelemetryExporterConfiguration(
  exporter: string,
  value: object,
  values: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, JsonValue>> {
  return Effect.runSync(
    resolveTelemetryExporterConfigurationEffect(exporter, value, values).pipe(
      Effect.mapError(legacy),
    ),
  );
}
