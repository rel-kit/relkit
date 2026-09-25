import type { Effect } from "effect";
import type { ObservabilityCollectorError } from "./collector-error.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { RedactedCapture, RedactionPolicy } from "./redaction.js";
import type { ObservabilitySignal } from "./model.js";

export type { ObservabilityRecord } from "./model.js";
import type { ObservabilityRecord } from "./model.js";

/**
 * Retention and capture policy for a memory-only collector.
 *
 * @example
 * const options: ObservabilityCollectorOptions = { maxRecords: 100, signals: ["log"] };
 */
export interface ObservabilityCollectorOptions {
  readonly maxRecords?: number;
  readonly redaction?: RedactionPolicy;
  readonly signals?: readonly ObservabilitySignal[];
}

/**
 * Effect operations behind the synchronous collector surface.
 * Redaction policy failures appear as ObservabilityCollectorError.
 *
 * @example
 * const collector = Effect.runSync(makeObservabilityCollectorEffect({ maxRecords: 100 }));
 * Effect.runSync(collector.read());
 */
export interface ObservabilityCollectorEffects {
  /** @param event - Runtime event or model record. @returns An admitted record or a typed error. */
  readonly emit: (
    event: unknown,
  ) => Effect.Effect<RedactedObservabilityRecord | undefined, ObservabilityCollectorError>;
  /** @param record - Model record to capture when its signal is enabled. @returns An admitted record or a typed error. */
  readonly collect: (
    record: ObservabilityRecord,
  ) => Effect.Effect<RedactedObservabilityRecord | undefined, ObservabilityCollectorError>;
  /** @param record - Model record admitted regardless of the signal filter. @returns An admitted record or a typed error. */
  readonly collectRequired: (
    record: ObservabilityRecord,
  ) => Effect.Effect<RedactedObservabilityRecord | undefined, ObservabilityCollectorError>;
  /** @returns A frozen snapshot of retained records. */
  readonly read: () => Effect.Effect<readonly RedactedObservabilityRecord[]>;
  /** @returns Completion after retained records and drop count are cleared. */
  readonly clear: () => Effect.Effect<void>;
  /** @returns The number of records evicted by retention. */
  readonly dropped: () => Effect.Effect<number>;
  /** @param value - Data to redact for a bounded capture. @returns The capture or a typed error. */
  readonly capture: (
    value: unknown,
  ) => Effect.Effect<RedactedCapture | undefined, ObservabilityCollectorError>;
}

/**
 * Synchronous compatibility interface for existing observability hooks.
 * Methods throw TypeError for invalid redaction policy input.
 *
 * @example
 * const collector = createObservabilityCollector({ maxRecords: 100 });
 * collector.emit(event);
 */
export interface ObservabilityCollector {
  readonly protocol: "relkit.observability.hooks";
  readonly version: typeof import("@relkit/contracts").PROTOCOL_VERSION;
  /** @param event - Runtime event or model record. @returns An admitted record when captured. @throws {TypeError} For invalid redaction. */
  readonly emit: (event: unknown) => RedactedObservabilityRecord | undefined;
  /** @param record - Model record subject to the signal filter. @returns An admitted record when captured. @throws {TypeError} For invalid redaction. */
  readonly collect: (record: ObservabilityRecord) => RedactedObservabilityRecord | undefined;
  /** @param record - Model record admitted regardless of signal filter. @returns An admitted record when valid. @throws {TypeError} For invalid redaction. */
  readonly collectRequired: (
    record: ObservabilityRecord,
  ) => RedactedObservabilityRecord | undefined;
  /** @returns A frozen snapshot of retained records. */
  readonly read: () => readonly RedactedObservabilityRecord[];
  /** @returns Nothing after retained records and drop count are cleared. */
  readonly clear: () => void;
  /** @returns The number of records evicted by retention. */
  readonly dropped: () => number;
  /** @param value - Data to redact for a bounded capture. @returns The capture when enabled. @throws {TypeError} For invalid redaction. */
  readonly capture: (value: unknown) => RedactedCapture | undefined;
}

/**
 * Bounded labels for collector operation metrics.
 *
 * @example
 * const operation: CollectorOperation = "collect";
 */
export type CollectorOperation =
  "create" | "emit" | "collect" | "collectRequired" | "read" | "clear" | "dropped" | "capture";
