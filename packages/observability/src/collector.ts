import { PROTOCOL_VERSION } from "@relkit/contracts";
import {
  OBSERVABILITY_MODEL_VERSION,
  type ObservabilityRecord,
  type ObservabilitySignal,
} from "./model.js";
import { admitObservabilityRecord } from "./record-admission.js";
import { captureRedacted, type RedactedCapture, type RedactionPolicy } from "./redaction.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import { toObservabilityRecord } from "./collector-events.js";

export const OBSERVABILITY_HOOK_PROTOCOL = "relkit.observability.hooks" as const;
export const OBSERVABILITY_HOOK_VERSION = PROTOCOL_VERSION;
export const DEFAULT_COLLECTOR_MAX_RECORDS = 1_024;
const OBSERVABILITY_SIGNALS = new Set<ObservabilitySignal>([
  "request",
  "invocation",
  "job",
  "event",
  "operation",
  "tool",
  "agent",
  "log",
  "span",
  "trace",
  "diagnostic",
  "generation",
]);

export interface ObservabilityCollectorOptions {
  readonly maxRecords?: number;
  readonly redaction?: RedactionPolicy;
  readonly signals?: readonly ObservabilitySignal[];
}

export interface ObservabilityCollector {
  readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
  readonly version: typeof OBSERVABILITY_HOOK_VERSION;
  readonly emit: (event: unknown) => RedactedObservabilityRecord | undefined;
  readonly collect: (record: ObservabilityRecord) => RedactedObservabilityRecord | undefined;
  readonly collectRequired: (
    record: ObservabilityRecord,
  ) => RedactedObservabilityRecord | undefined;
  readonly read: () => readonly RedactedObservabilityRecord[];
  readonly clear: () => void;
  readonly dropped: () => number;
  readonly capture: (value: unknown) => RedactedCapture | undefined;
}

/**
 * Creates the bounded, memory-only observability admission point.
 * Records are redacted and converted to canonical frozen JSON before retention.
 */
export function createObservabilityCollector(
  options: ObservabilityCollectorOptions = {},
): ObservabilityCollector {
  const maxRecords = options.maxRecords ?? DEFAULT_COLLECTOR_MAX_RECORDS;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1)
    throw new TypeError("Observability collector maxRecords must be a positive safe integer");
  const capturedSignals = options.signals === undefined ? undefined : new Set(options.signals);
  if (capturedSignals?.size !== options.signals?.length)
    throw new TypeError("Observability collector signals must be unique");
  if ([...(capturedSignals ?? [])].some((signal) => !OBSERVABILITY_SIGNALS.has(signal)))
    throw new TypeError("Observability collector signal is invalid");
  const retained: RedactedObservabilityRecord[] = [];
  let dropped = 0;

  const retain = (record: ObservabilityRecord): RedactedObservabilityRecord | undefined => {
    const admitted = admitObservabilityRecord(record, options.redaction);
    if (!isAdmittedRecord(admitted)) return undefined;
    if (retained.length >= maxRecords) {
      // ponytail: shift is O(maxRecords); use a ring buffer only if retention grows materially.
      retained.shift();
      dropped += 1;
    }
    retained.push(admitted);
    return admitted;
  };
  const collect = (record: ObservabilityRecord): RedactedObservabilityRecord | undefined => {
    if (capturedSignals !== undefined && !capturedSignals.has(record.signal)) return undefined;
    return retain(record);
  };
  const emit = (event: unknown): RedactedObservabilityRecord | undefined => {
    const record = toObservabilityRecord(event);
    return record === undefined ? undefined : collect(record);
  };
  return Object.freeze({
    protocol: OBSERVABILITY_HOOK_PROTOCOL,
    version: OBSERVABILITY_HOOK_VERSION,
    emit,
    collect,
    collectRequired: retain,
    read: () => Object.freeze([...retained]),
    clear: () => {
      retained.length = 0;
      dropped = 0;
    },
    dropped: () => dropped,
    capture: (value: unknown) => captureRedacted(value, options.redaction ?? {}),
  });
}

function isAdmittedRecord(value: unknown): value is ObservabilityRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly version?: unknown }).version === OBSERVABILITY_MODEL_VERSION &&
    isSignal((value as { readonly signal?: unknown }).signal)
  );
}

function isSignal(value: unknown): value is ObservabilitySignal {
  return typeof value === "string" && OBSERVABILITY_SIGNALS.has(value as ObservabilitySignal);
}
