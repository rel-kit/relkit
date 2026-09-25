import type { Effect } from "effect";
import type {
  TelemetryExporterFailure,
  TelemetryExporterStatus,
} from "./telemetry-exporter.types.js";
import type { TelemetryExportRecord } from "./telemetry-sampling.js";
import type { TelemetryFanoutError } from "./telemetry-exporters-effect.js";
/** Effect operations for one owned exporter fanout. */
export interface TelemetryExporterFanoutEffects {
  readonly exportRecord: (
    ...args: Parameters<TelemetryExportRecord>
  ) => Effect.Effect<void, TelemetryFanoutError>;
  readonly flush: (timeoutMs?: number) => Effect.Effect<void, TelemetryFanoutError>;
  readonly close: (timeoutMs?: number) => Effect.Effect<void, TelemetryFanoutError>;
  readonly stats: () => Effect.Effect<readonly TelemetryExporterStatus[], TelemetryFanoutError>;
  readonly setFailureHandler: (
    handler: (failure: TelemetryExporterFailure) => void,
  ) => Effect.Effect<void, TelemetryFanoutError>;
}
