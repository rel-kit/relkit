/** Validates network records again; in-process redaction brands are never trusted across JSON. */
import { Schema } from "effect";
import { validateLocalRecord, type LocalRecord } from "@relkit/observability/local/record";

const record = Schema.declare<LocalRecord["record"]>((value): value is LocalRecord["record"] => {
  try {
    validateLocalRecord({ key: "decode", origin: "application", record: value });
    return true;
  } catch (cause) {
    if (cause instanceof TypeError) return false;
    throw cause;
  }
});

/** A finite batch has monotonic session sequence identities and optional producer attribution. */
export const InspectionCollectionBatch = Schema.fromJsonString(
  Schema.Struct({
    records: Schema.Array(
      Schema.Struct({
        sequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
        record,
        identity: Schema.optionalKey(
          Schema.Struct({
            key: Schema.String.check(Schema.isMaxLength(512)),
            origin: Schema.Literals(["application", "relkit", "inspector"]),
          }),
        ),
      }),
    ).check(Schema.isMaxLength(256)),
    gap: Schema.Boolean,
    droppedRecords: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    incomplete: Schema.Boolean,
    droppedBytes: Schema.optionalKey(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    ),
    producerFailed: Schema.optionalKey(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    ),
    producerDropped: Schema.optionalKey(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    ),
  }),
);
