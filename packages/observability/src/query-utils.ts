import { Effect } from "effect";
import type { ObservabilityRecord, ObservabilitySignal } from "./model.js";
import type { RedactionPolicy } from "./redaction.types.js";
import type { RedactedObservabilityRecord } from "./record-admission.types.js";
import type { ObservabilityIndexEntry } from "./storage/index.types.js";
import type { QueryIndex } from "./query-utils.types.js";
import {
  ObservabilityQueryError,
  type ObservabilityQueryPage,
  type ObservabilityQueryRequest,
} from "./query-types.js";
import { type QueryValidationError } from "./query-validation-effect.js";
import { collectQueryEffect, readPageEffect } from "./query-page-effect.js";
import {
  findCursorEffect,
  QueryIndexService,
  QueryReadError,
  queryIndexLayer,
  safeReadEffect,
} from "./query-read-effect.js";
export { collectQueryEffect, readPageEffect } from "./query-page-effect.js";
export {
  findCursorEffect,
  QueryIndexService,
  QueryReadError,
  queryIndexLayer,
  safeReadEffect,
} from "./query-read-effect.js";
function run<A>(
  index: QueryIndex,
  effect: Effect.Effect<A, QueryReadError | QueryValidationError, QueryIndexService>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(queryIndexLayer(index)),
      Effect.mapError((error) =>
        error._tag === "QueryReadError"
          ? error.cause
          : new ObservabilityQueryError(error.code, error.message),
      ),
    ),
  );
}
/**
 * Reads a bounded page in index order and re-admits each record.
 * @param index - Borrowed index; the runtime retains ownership.
 * @param input - Query filters and cursor.
 * @param maxPageSize - Maximum index page size.
 * @param redaction - Optional query redaction policy.
 * @param signal - Optional required record signal.
 * @param accept - Optional record predicate.
 * @param pageKind - Record or trace index.
 * @returns A Promise with a versioned page.
 * @throws {ObservabilityQueryError} If query fields are invalid.
 * @example
 * const page = await readPage(index, { limit: 10 }, 100, undefined, "log");
 */
export function readPage<T extends ObservabilityRecord>(
  index: QueryIndex,
  input: ObservabilityQueryRequest,
  maxPageSize: number,
  redaction: RedactionPolicy | undefined,
  signal?: ObservabilitySignal,
  accept: (record: ObservabilityRecord) => boolean = (record) =>
    signal === undefined || record.signal === signal,
  pageKind: "records" | "traces" = "records",
): Promise<ObservabilityQueryPage<T>> {
  return run(index, readPageEffect<T>(input, maxPageSize, redaction, signal, accept, pageKind));
}
/**
 * Collects admitted records for a bounded detail query.
 * @param index - Borrowed index.
 * @param input - Query filters.
 * @param maximum - Maximum record count.
 * @param options - Optional redaction policy.
 * @param accept - Optional record predicate.
 * @returns A Promise with admitted records.
 * @example
 * const records = await collect(index, { requestId }, 200, {});
 */
export function collect(
  index: QueryIndex,
  input: ObservabilityQueryRequest,
  maximum: number,
  options: { readonly redaction?: RedactionPolicy },
  accept?: (record: ObservabilityRecord) => boolean,
): Promise<RedactedObservabilityRecord[]> {
  return run(index, collectQueryEffect(input, maximum, options, accept));
}
/**
 * Finds one cursor by paging the index in order.
 * @param index - Borrowed index.
 * @param cursor - Target cursor.
 * @param maxPageSize - Index page bound.
 * @param signal - Required record signal.
 * @returns A Promise with the entry or undefined.
 * @example
 * const entry = await findCursor(index, "3", 100, "log");
 */
export function findCursor(
  index: QueryIndex,
  cursor: string,
  maxPageSize: number,
  signal: ObservabilitySignal,
): Promise<ObservabilityIndexEntry | undefined> {
  return run(index, findCursorEffect(cursor, maxPageSize, signal));
}
/**
 * Reads, redacts, and validates one index entry.
 * @param index - Borrowed index.
 * @param entry - Entry to read.
 * @param redaction - Optional redaction policy.
 * @param signal - Optional required signal.
 * @returns A Promise with an admitted record or undefined.
 * @example
 * const record = await safeRead(index, entry, undefined, "log");
 */
export function safeRead(
  index: QueryIndex,
  entry: ObservabilityIndexEntry,
  redaction: RedactionPolicy | undefined,
  signal?: ObservabilitySignal,
): Promise<RedactedObservabilityRecord | undefined> {
  return run(index, safeReadEffect(entry, redaction, signal));
}
