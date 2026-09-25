import type { ObservabilityRecord } from "./model.js";

declare const redactedRecordBrand: unique symbol;

/** A model record accepted by the in-memory redaction boundary. */
export type RedactedObservabilityRecord = ObservabilityRecord & {
  readonly [redactedRecordBrand]: true;
};
