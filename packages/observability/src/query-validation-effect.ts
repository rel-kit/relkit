import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { ObservabilityRecord } from "./model.js";
import type { NormalizedQuery } from "./query-validation.types.js";
import {
  ObservabilityQueryError,
  type ObservabilityQueryPage,
  type ObservabilityQueryRequest,
} from "./query-types.js";
import { queryValidationCore as core } from "./query-validation-core.js";
/**
 * Tagged query validation failure returned by the Effect operations.
 * @example
 * if (error._tag === "QueryValidationError") console.error(error.code);
 */
export class QueryValidationError extends Schema.TaggedError<QueryValidationError>()(
  "QueryValidationError",
  {
    code: Schema.Literals([
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
    ]),
    message: Schema.String,
  },
) {}
function observe<A, E>(operation: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_query_validation_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_query_validation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function expected<A>(run: () => A): Effect.Effect<A, QueryValidationError> {
  return Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof ObservabilityQueryError
        ? Effect.fail(new QueryValidationError({ code: cause.code, message: cause.message }))
        : Effect.die(cause),
    ),
  );
}
/**
 * Normalizes and validates a query request.
 * @param value - Untrusted query fields.
 * @param maximum - Maximum page size.
 * @returns An Effect with a normalized query or tagged validation failure.
 * @example
 * const query = Effect.runSync(validateQueryEffect({ limit: 10 }, 100));
 */
export const validateQueryEffect = Effect.fn("ObservabilityQuery.validate")(
  (value: ObservabilityQueryRequest, maximum: number) =>
    observe(
      "validate",
      expected(() => core.validate(value, maximum)),
    ),
);
/**
 * Tests whether a record matches the query filters.
 * @param record - Candidate record.
 * @param query - Validated query.
 * @returns An Effect with the match result; malformed records can defect.
 * @example
 * const matches = Effect.runSync(matchesQueryEffect(record, query));
 */
export const matchesQueryEffect = Effect.fn("ObservabilityQuery.matches")(
  (record: ObservabilityRecord, query: NormalizedQuery) =>
    observe(
      "matches",
      Effect.sync(() => core.matches(record, query)),
    ),
);
/**
 * Tests whether a timestamp falls in the query time range.
 * @param timestamp - Record timestamp.
 * @param query - Validated query.
 * @returns An Effect with true when the timestamp is in range.
 * @example
 * const included = Effect.runSync(inQueryTimeRangeEffect(timestamp, query));
 */
export const inQueryTimeRangeEffect = Effect.fn("ObservabilityQuery.inTimeRange")(
  (timestamp: string, query: NormalizedQuery) =>
    observe(
      "inTimeRange",
      Effect.sync(() => core.inTimeRange(timestamp, query)),
    ),
);
/**
 * Wraps immutable query items in a versioned response.
 * @param items - Page items.
 * @param nextCursor - Optional next-page cursor.
 * @returns An Effect with a frozen protocol response.
 * @example
 * const page = Effect.runSync(queryResponseEffect([record]));
 */
export const queryResponseEffect = Effect.fn("ObservabilityQuery.response")(
  <T>(items: readonly T[], nextCursor?: string): Effect.Effect<ObservabilityQueryPage<T>> =>
    observe(
      "response",
      Effect.sync(() => core.response(items, nextCursor)),
    ),
);
/**
 * Checks a positive query bound and caps it at the protocol maximum.
 * @param value - Requested bound.
 * @returns An Effect with a bound or tagged validation failure.
 * @example
 * const size = Effect.runSync(positiveQueryEffect(10));
 */
export const positiveQueryEffect = Effect.fn("ObservabilityQuery.positive")((value: number) =>
  observe(
    "positive",
    expected(() => core.positive(value)),
  ),
);
