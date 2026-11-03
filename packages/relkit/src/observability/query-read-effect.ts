import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import type { ObservabilitySignal } from "./model.js";
import type { RedactionPolicy } from "./redaction.types.js";
import type { ObservabilityIndexEntry } from "./storage/index.types.js";
import type { QueryIndex } from "./query-utils.types.js";
import { validateQueryEffect } from "./query-validation-effect.js";
import { admitObservabilityRecordEffect } from "./record-admission.js";
/**
 * Tagged index-read or admission failure from an Effect query operation.
 * @example
 * if (error._tag === "QueryReadError") console.error(error.reason);
 */
export class QueryReadError extends Schema.TaggedError<QueryReadError>()("QueryReadError", {
  reason: Schema.Literals(["index", "redaction"]),
  cause: Schema.Defect(),
}) {}
/**
 * Substitutable index read operations; the owning runtime closes the index.
 * @example
 * const program = Effect.gen(function* () { return yield* QueryIndexService; });
 */
// prettier-ignore
export class QueryIndexService extends Context.Service<QueryIndexService, QueryIndex>()(
  "@relkit/observability/QueryIndex",
) {}
/**
 * Provides an existing index to Effect queries without taking ownership.
 * @param index - Page and read implementation supplied by the runtime or a test.
 * @returns A Layer with the query index service.
 * @example
 * const page = await Effect.runPromise(readPageEffect({}, 100).pipe(Effect.provide(queryIndexLayer(index))));
 */
export function queryIndexLayer(index: QueryIndex) {
  return Layer.succeed(QueryIndexService, QueryIndexService.of(index));
}
function observe<A, E, R>(
  operation: "safeRead" | "findCursor",
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_query_reads_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_query_read_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Reads and re-admits an index entry before returning it to a query.
 * Native index reads have no cancellation signal; interruption waits for read completion.
 * @param entry - Index entry to read.
 * @param redaction - Optional query redaction policy.
 * @param signal - Optional required record signal.
 * @returns An Effect with an admitted record, undefined, or tagged read failure.
 * @example
 * const record = yield* safeReadEffect(entry);
 */
export const safeReadEffect = Effect.fn("ObservabilityQuery.safeRead")(
  (entry: ObservabilityIndexEntry, redaction?: RedactionPolicy, signal?: ObservabilitySignal) =>
    observe(
      "safeRead",
      Effect.gen(function* () {
        const index = yield* QueryIndexService;
        const value = yield* Effect.uninterruptible(
          Effect.tryPromise({
            try: () => index.read(entry),
            catch: (cause) => new QueryReadError({ reason: "index", cause }),
          }),
        );
        if (value === undefined || (signal !== undefined && value.signal !== signal))
          return undefined;
        const safe = yield* admitObservabilityRecordEffect(value, redaction).pipe(
          Effect.mapError(
            (error) =>
              new QueryReadError({ reason: "redaction", cause: new TypeError(error.message) }),
          ),
        );
        return safe?.version === value.version && typeof safe.signal === "string"
          ? safe
          : undefined;
      }),
    ),
);
/**
 * Finds a retained cursor in the index by paging in order.
 * @param cursor - Target cursor.
 * @param maxPageSize - Bound for index page reads.
 * @param signal - Required signal type.
 * @returns An Effect with the matching entry or undefined.
 * @example
 * const entry = yield* findCursorEffect("3", 100, "log");
 */
export const findCursorEffect = Effect.fn("ObservabilityQuery.findCursor")(
  (cursor: string, maxPageSize: number, signal: ObservabilitySignal) =>
    observe(
      "findCursor",
      Effect.gen(function* () {
        yield* validateQueryEffect({ cursor, limit: 1 }, maxPageSize);
        const index = yield* QueryIndexService;
        let after: string | undefined;
        while (true) {
          const page = yield* Effect.try({
            try: () =>
              index.page({
                signal,
                ...(after === undefined ? {} : { cursor: after }),
                limit: maxPageSize,
              }),
            catch: (cause) => new QueryReadError({ reason: "index", cause }),
          });
          const found = page.entries.find((entry) => entry.cursor === cursor);
          if (found !== undefined) return found;
          if (page.nextCursor === undefined || page.nextCursor === after) return undefined;
          after = page.nextCursor;
        }
      }),
    ),
);
