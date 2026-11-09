import type { ObservabilityRecord } from "./model.js";
import { recordAdmissionCore } from "./record-admission-core.js";
import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import { redactRecordEffect, type RedactionPolicy } from "./redaction.js";
import type { RedactedObservabilityRecord } from "./record-admission.types.js";
export type { RedactedObservabilityRecord } from "./record-admission.types.js";
/**
 * Tagged redaction failure while admitting a model record.
 * @example
 * if (error._tag === "RecordAdmissionError") console.error(error.message);
 */
export class RecordAdmissionError extends Schema.TaggedError<RecordAdmissionError>()(
  "RecordAdmissionError",
  { message: Schema.String },
) {}
function observe<A, E>(
  operation: "admit" | "isRedacted",
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_record_admission_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_record_admission_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Redacts and brands a model record within an observed Effect.
 * @param record - Model record to admit.
 * @param policy - Optional redaction policy.
 * @returns An Effect with the admitted record, undefined, or a tagged redaction error.
 * @example
 * const safe = Effect.runSync(admitObservabilityRecordEffect(record));
 */
export const admitObservabilityRecordEffect = Effect.fn("ObservabilityRecord.admit")(
  (record: ObservabilityRecord, policy?: RedactionPolicy) =>
    observe(
      "admit",
      redactRecordEffect(record, policy).pipe(
        Effect.mapError((error) => new RecordAdmissionError({ message: error.message })),
        Effect.map(recordAdmissionCore.admitRedacted),
      ),
    ),
);
/**
 * Checks the in-memory admission brand within an observed Effect.
 * @param value - Candidate object.
 * @returns An Effect with true only for an admitted object.
 * @example
 * const admitted = Effect.runSync(isRedactedObservabilityRecordEffect(value));
 */
export const isRedactedObservabilityRecordEffect = Effect.fn("ObservabilityRecord.isRedacted")(
  (value: unknown) =>
    observe(
      "isRedacted",
      Effect.sync(() => recordAdmissionCore.isRedactedRecord(value)),
    ),
);
/**
 * Redacts and brands one model record before a collector-owned sink sees it.
 * @param record - Model record to admit.
 * @param policy - Optional redaction policy.
 * @returns The admitted record, or undefined if validation rejects it.
 * @throws {TypeError} If the redaction policy is invalid.
 * @example
 * const safe = admitObservabilityRecord(record);
 */
export function admitObservabilityRecord(
  record: ObservabilityRecord,
  policy?: RedactionPolicy,
): RedactedObservabilityRecord | undefined {
  return Effect.runSync(
    admitObservabilityRecordEffect(record, policy).pipe(
      Effect.catchTag("RecordAdmissionError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}
/**
 * Checks whether this exact object came from admission.
 * @param value - Candidate object.
 * @returns True only for an admitted in-memory object.
 * @example
 * if (isRedactedObservabilityRecord(value)) consume(value);
 */
export function isRedactedObservabilityRecord(
  value: unknown,
): value is RedactedObservabilityRecord {
  return Effect.runSync(isRedactedObservabilityRecordEffect(value));
}
