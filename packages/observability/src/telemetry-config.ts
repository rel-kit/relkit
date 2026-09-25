import { Effect } from "effect";
import type {
  TelemetryConfiguration,
  TelemetryExporterDescriptor,
  TelemetryExporterMap,
} from "./telemetry-config.types.js";
import {
  defineTelemetryExporterEffect,
  isTelemetryExporterDescriptorEffect,
  normalizeTelemetryConfigurationEffect,
  type TelemetryConfigError,
} from "./telemetry-config-effect.js";
export type {
  TelemetryCapturePolicy,
  TelemetryConfiguration,
  TelemetryExporterDescriptor,
  TelemetryExporterMap,
  TelemetryExportSamplingPolicy,
  TelemetryLocalRetentionPolicy,
} from "./telemetry-config.types.js";
export { TELEMETRY_EXPORTER_PROTOCOL_VERSION } from "./telemetry-config-core.js";
export {
  TelemetryConfigError,
  defineTelemetryExporterEffect,
  isTelemetryExporterDescriptorEffect,
  normalizeTelemetryConfigurationEffect,
} from "./telemetry-config-effect.js";
function run<A>(effect: Effect.Effect<A, TelemetryConfigError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.catchTag("TelemetryConfigError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}
/**
 * Defines a validated, frozen telemetry exporter descriptor.
 * @param integrationId - Stable integration identifier.
 * @param adapterId - Stable adapter identifier.
 * @param configuration - Serializable adapter configuration.
 * @returns The descriptor with its protocol version.
 * @throws {TypeError} If IDs or configuration are invalid.
 * @example
 * const exporter = defineTelemetryExporter("aws", "otlp", {});
 */
export function defineTelemetryExporter<
  const IntegrationId extends string,
  const AdapterId extends string,
  const Configuration extends object,
>(
  integrationId: IntegrationId,
  adapterId: AdapterId,
  configuration: Configuration,
): TelemetryExporterDescriptor<IntegrationId, AdapterId, Configuration> {
  return run(defineTelemetryExporterEffect(integrationId, adapterId, configuration));
}
/**
 * Normalizes and validates all telemetry configuration sections.
 * @param value - Input configuration.
 * @returns A frozen normalized configuration.
 * @throws {TypeError} If a configuration section is invalid.
 * @example
 * const config = normalizeTelemetryConfiguration({ capture: { signals: ["log"] } });
 */
export function normalizeTelemetryConfiguration<Exporters extends TelemetryExporterMap>(
  value: TelemetryConfiguration<Exporters> = {},
): TelemetryConfiguration<Exporters> {
  return run(normalizeTelemetryConfigurationEffect(value));
}
/**
 * Checks a telemetry exporter descriptor without throwing for invalid values.
 * @param value - Candidate descriptor.
 * @returns True only for a valid descriptor.
 * @example
 * if (isTelemetryExporterDescriptor(value)) use(value);
 */
export function isTelemetryExporterDescriptor(
  value: unknown,
): value is TelemetryExporterDescriptor {
  return run(isTelemetryExporterDescriptorEffect(value));
}
