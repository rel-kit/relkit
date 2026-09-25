import type { TelemetryExporterFailure } from "./telemetry-exporter.types.js";
import type { TelemetryExporterMap } from "./telemetry-config.js";

/** Configuration and runtime modules used to create an exporter fanout. */
export interface TelemetryExporterFanoutOptions {
  readonly exporters?: TelemetryExporterMap;
  readonly modules: readonly { readonly module: unknown }[];
  readonly values?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly onFailure?: (failure: TelemetryExporterFailure) => void;
}
