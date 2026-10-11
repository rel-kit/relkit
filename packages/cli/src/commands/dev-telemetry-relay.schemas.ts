/**
 * Decodes bounded producer batches through the persistent envelope owner's codec.
 * Request text is bounded before JSON decoding; raw bytes never enter retention,
 * and accepted model records still undergo configured redaction before admission.
 */
import { Schema } from "effect";
import { validateLocalRecord, type LocalRecord } from "@relkit/observability/local/record";

/** Existing envelope semantics, preserving producer key and origin after validation. */
const envelope = Schema.declare<LocalRecord>((value): value is LocalRecord => {
  try {
    validateLocalRecord(value);
    return true;
  } catch (cause) {
    if (cause instanceof TypeError) return false;
    throw cause;
  }
});

/** Protocol batch size matches the existing remote producer's 256-record limit. */
export const TelemetryRelayBatch = Schema.fromJsonString(
  Schema.Struct({
    records: Schema.Array(envelope).check(Schema.isMaxLength(256)),
  }),
);
