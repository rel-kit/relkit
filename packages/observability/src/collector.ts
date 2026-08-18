import { PROTOCOL_VERSION } from "@zsys/contracts";
import {
  OBSERVABILITY_MODEL_VERSION,
  type ObservabilityRecord,
  type ObservabilitySignal,
} from "./model.js";
import { admitObservabilityRecord } from "./record-admission.js";
import type { RedactionPolicy } from "./redaction.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import { toObservabilityRecord } from "./collector-events.js";

export const OBSERVABILITY_HOOK_PROTOCOL = "zsys.observability.hooks" as const;
export const OBSERVABILITY_HOOK_VERSION = PROTOCOL_VERSION;
export const DEFAULT_COLLECTOR_MAX_RECORDS = 1_024;
const OBSERVABILITY_SIGNALS = new Set<ObservabilitySignal>([
  "request",
  "invocation",
  "job",
  "event",
  "resource",
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
}

export interface ObservabilityCollector {
  readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
  readonly version: typeof OBSERVABILITY_HOOK_VERSION;
  readonly emit: (event: unknown) => void;
  readonly collect: (record: ObservabilityRecord) => RedactedObservabilityRecord | undefined;
  readonly read: () => readonly RedactedObservabilityRecord[];
  readonly clear: () => void;
  readonly dropped: () => number;
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
  const retained: RedactedObservabilityRecord[] = [];
  let dropped = 0;

  const collect = (record: ObservabilityRecord): RedactedObservabilityRecord | undefined => {
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
  const emit = (event: unknown): void => {
    const record = toObservabilityRecord(event);
    if (record !== undefined) collect(record);
  };
  return Object.freeze({
    protocol: OBSERVABILITY_HOOK_PROTOCOL,
    version: OBSERVABILITY_HOOK_VERSION,
    emit,
    collect,
    read: () => Object.freeze([...retained]),
    clear: () => {
      retained.length = 0;
      dropped = 0;
    },
    dropped: () => dropped,
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
