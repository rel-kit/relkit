import { Schema } from "effect";
import {
  validateLocalRecord,
  type LocalRecord,
  type StoredLocalRecord,
} from "@relkit/observability/local";
import type {
  ObservabilityRecord,
  LogRecord,
  RequestRecord,
  SpanRecord,
  TraceRecord,
} from "@relkit/observability";

/** Original envelope boundary validated by the local record owner without copying identity. */
export const telemetryEnvelopeSchema = Schema.declare<LocalRecord>(
  (value): value is LocalRecord => {
    try {
      validateLocalRecord(value);
      return true;
    } catch {
      return false;
    }
  },
);

/**
 * Narrows native worker model records through the existing record owner's validation.
 * @param value - Original worker record, still untrusted after IPC transport.
 * @returns Whether the original local envelope validator accepts this record.
 */
function isRecord(value: unknown): value is ObservabilityRecord {
  return Schema.is(telemetryEnvelopeSchema)({
    key: "worker-schema",
    origin: "relkit",
    record: value,
  });
}

/** Native model record; the producer/model owner remains the semantic authority. */
export const telemetryRecordSchema = Schema.declare(isRecord);
/** Native log projection retaining optional stored cursor and origin fields. */
export const telemetryLogSchema = Schema.declare<LogRecord>(
  (value): value is LogRecord => isRecord(value) && value.signal === "log",
);
/** Native request projection accepted only after owner validation. */
export const telemetryRequestSchema = Schema.declare<RequestRecord>(
  (value): value is RequestRecord => isRecord(value) && value.signal === "request",
);
/** Native span projection accepted only after owner validation. */
export const telemetrySpanSchema = Schema.declare<SpanRecord>(
  (value): value is SpanRecord => isRecord(value) && value.signal === "span",
);
/** Native trace projection accepted only after owner validation. */
export const telemetryTraceSchema = Schema.declare<TraceRecord>(
  (value): value is TraceRecord => isRecord(value) && value.signal === "trace",
);
/** Original worker-open import summary. */
export const telemetryImportSchema = Schema.Struct({
  records: Schema.Number,
  malformed: Schema.Number,
});
/** Worker-persisted transport identity before model-record validation. */
export const telemetryStoredIdentitySchema = Schema.Struct({
  cursor: Schema.String,
  origin: Schema.Literals(["application", "relkit", "inspector"]),
});
/** Flattened persisted record, retaining all model fields and original native identity. */
export const telemetryStoredSchema = Schema.declare<StoredLocalRecord>(
  (value): value is StoredLocalRecord =>
    Schema.is(telemetryStoredIdentitySchema)(value) && isRecord(value),
);
/** Bounded native producer status without trusting coercible numeric values. */
export const telemetryProducerSchema = Schema.Struct({
  source: Schema.String,
  failed: Schema.Number,
  dropped: Schema.Number,
});
/** Original transport batch; envelope semantics are validated separately. */
export const telemetryBatchSchema = Schema.Struct({ records: Schema.Array(Schema.Unknown) });
