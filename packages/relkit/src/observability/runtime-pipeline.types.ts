/** Captured resources and counters owned by one local application telemetry runtime. */
import type { ObservabilityCollector } from "./collector.types.js";
import type { ObservabilityStream } from "./stream.types.js";
import type { ObservabilityRuntimeStorage } from "./runtime-storage.types.js";
import type { ObservabilityRuntimeOptions, TelemetryPipelineCounters } from "./runtime.types.js";
import type { DirectExportOperations } from "./direct-export.types.js";

/** Runtime-owned state shared by append, export, flush and release operations. */
export interface RuntimePipelineState {
  readonly collector: ObservabilityCollector;
  readonly stream: ObservabilityStream;
  readonly store: ObservabilityRuntimeStorage;
  readonly options: ObservabilityRuntimeOptions;
  readonly pending: Set<Promise<void>>;
  readonly counters: {
    -readonly [Key in keyof TelemetryPipelineCounters]: TelemetryPipelineCounters[Key];
  };
  directExport: DirectExportOperations | undefined;
  persistFailure: Error | undefined;
  closePromise: Promise<void> | undefined;
}
