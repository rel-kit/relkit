import type { Effect } from "effect";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExportQueueError } from "./telemetry-export-queue-effect.js";

/** The policy used when a new unit would exceed queue capacity. */
export type TelemetryExportOverflow = "drop-oldest" | "drop-newest";

/** Bounded labels for export queue operation metrics. */
export type TelemetryExportQueueOperation = "create" | "enqueue" | "take" | "dropAll" | "stats";

/** One atomic group of redacted records sent to an exporter. */
export interface TelemetryExportUnit {
  readonly id: string;
  readonly records: readonly RedactedObservabilityRecord[];
}

/** Bounded queue configuration. */
export interface TelemetryExportQueueOptions {
  readonly maxRecords: number;
  readonly overflow?: TelemetryExportOverflow;
  readonly mergeAdjacent?: boolean;
}

/** Cumulative queue activity and current occupancy. */
export interface TelemetryExportQueueStats {
  readonly receivedRecords: number;
  readonly queuedRecords: number;
  readonly queuedUnits: number;
  readonly droppedRecords: number;
  readonly droppedUnits: number;
}

/** Queue operations with typed Effect failures and instrumentation. */
export interface TelemetryExportQueueEffects {
  /** @param unit - Redacted export unit. @returns Whether it was retained, or a validation error. */
  readonly enqueue: (
    unit: TelemetryExportUnit,
  ) => Effect.Effect<boolean, TelemetryExportQueueError>;
  /** @returns The oldest retained unit, if any. */
  readonly take: () => Effect.Effect<TelemetryExportUnit | undefined>;
  /** @returns Completion after all queued units are accounted as dropped. */
  readonly dropAll: () => Effect.Effect<void>;
  /** @returns A frozen snapshot of counters and occupancy. */
  readonly stats: () => Effect.Effect<TelemetryExportQueueStats>;
}

/** Compatibility surface for callers that require synchronous queue methods. */
export interface BoundedTelemetryExportQueue {
  /** @param unit - Redacted export unit. @returns Whether it was retained. */
  readonly enqueue: (unit: TelemetryExportUnit) => boolean;
  /** @returns The oldest retained unit, if any. */
  readonly take: () => TelemetryExportUnit | undefined;
  /** @returns Nothing after accounting all queued units as dropped. */
  readonly dropAll: () => void;
  /** @returns A frozen snapshot of counters and occupancy. */
  readonly stats: () => TelemetryExportQueueStats;
}
