import { Effect } from "effect";
import type { ObservabilityRecord } from "./model.js";
import type { NormalizedQuery } from "./query-validation.types.js";
import {
  ObservabilityQueryError,
  type ObservabilityQueryPage,
  type ObservabilityQueryRequest,
} from "./query-types.js";
import {
  inQueryTimeRangeEffect,
  matchesQueryEffect,
  positiveQueryEffect,
  queryResponseEffect,
  validateQueryEffect,
  type QueryValidationError,
} from "./query-validation-effect.js";
export type { NormalizedQuery } from "./query-validation.types.js";
function run<A>(effect: Effect.Effect<A, QueryValidationError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.catchTag("QueryValidationError", (error) =>
        Effect.sync(() => {
          throw new ObservabilityQueryError(error.code, error.message);
        }),
      ),
    ),
  );
}
/**
 * Validates and normalizes a query request.
 * @param value - Query fields.
 * @param maximum - Maximum page size.
 * @returns A normalized query.
 * @throws {ObservabilityQueryError} If input or protocol fields are invalid.
 * @example
 * const query = validate({ limit: 10 }, 100);
 */
export function validate(value: ObservabilityQueryRequest, maximum: number): NormalizedQuery {
  return run(validateQueryEffect(value, maximum));
}
/**
 * Tests a record against validated filters.
 * @param record - Candidate record.
 * @param query - Normalized query.
 * @returns True when the record matches.
 * @example
 * const included = matches(record, query);
 */
export function matches(record: ObservabilityRecord, query: NormalizedQuery): boolean {
  return run(matchesQueryEffect(record, query));
}
/**
 * Tests a timestamp against query time bounds.
 * @param timestamp - Record timestamp.
 * @param query - Normalized query.
 * @returns True when the timestamp is in range.
 * @example
 * const included = inTimeRange(record.timestamp, query);
 */
export function inTimeRange(timestamp: string, query: NormalizedQuery): boolean {
  return run(inQueryTimeRangeEffect(timestamp, query));
}
/**
 * Creates an immutable protocol query page.
 * @param items - Page items.
 * @param nextCursor - Optional next-page cursor.
 * @returns A frozen versioned page.
 * @example
 * const page = response([record]);
 */
export function response<T>(items: readonly T[], nextCursor?: string): ObservabilityQueryPage<T> {
  return run(queryResponseEffect(items, nextCursor));
}
/**
 * Validates and caps a positive query bound.
 * @param value - Requested bound.
 * @returns A bounded positive number.
 * @throws {ObservabilityQueryError} If the value is not a positive safe integer.
 * @example
 * const size = positive(10);
 */
export function positive(value: number): number {
  return run(positiveQueryEffect(value));
}
