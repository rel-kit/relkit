/** Defines application telemetry options, injected persistence authority and collection/export outcome counters. */
import type { ObservabilityCollectorOptions } from "./collector.js";
import type { RemoteObservabilityOptions } from "./remote-runtime.types.js";
import type { TelemetryConfiguration } from "./telemetry-config.js";
import type { TelemetryExporterFanout } from "./telemetry-exporter.types.js";
import type { TelemetryExportRecord } from "./telemetry-sampling.js";
import type { ObservabilityRuntimeStorage } from "./runtime-storage.types.js";

/**
 * Counts records accepted, streamed, selected, and rejected by the runtime.
 *
 * @example
 * const selected = runtime.exportCounters().exportSelected;
 */
export interface TelemetryPipelineCounters {
  readonly persisted: number;
  readonly streamed: number;
  readonly exportSelected: number;
  readonly sampledOut: number;
  readonly severityFiltered: number;
  readonly exportFailures: number;
}

/**
 * Configuration for local or remote observability runtime creation.
 *
 * @example
 * const options: ObservabilityRuntimeOptions = { root: "/tmp/observability" };
 */
export interface ObservabilityRuntimeOptions extends ObservabilityCollectorOptions {
  readonly remote?: RemoteObservabilityOptions;
  readonly root?: string;
  /** Explicit persistence authority; omitted runtimes retain bounded memory only. */
  readonly storage?: ObservabilityRuntimeStorage;
  readonly configuration?: TelemetryConfiguration;
  readonly exportRecord?: TelemetryExportRecord;
  readonly exporter?: TelemetryExporterFanout;
}
