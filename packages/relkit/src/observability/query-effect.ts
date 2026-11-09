import { Effect, Schema } from "effect";
import type { ObservabilityRecord, RequestRecord } from "./model.js";
import type {
  LogQueryItem,
  ObservabilityQueryOptions,
  ObservabilityQueryRequest,
  TraceQueryItem,
} from "./query-types.js";
import { MAX_EXECUTION_RECORDS } from "./execution-assembly.js";
import { requestDetailEffect, logDetailEffect, traceDetailEffect } from "./query-detail-effect.js";
import { observeQueryOperation as observe } from "./query-operation-metrics.js";
import { readPageEffect } from "./query-page-effect.js";
import { QueryIndexService } from "./query-read-effect.js";
import { positiveQueryEffect } from "./query-validation-effect.js";
/**
 * Tagged invalid detail bound from query construction.
 * @example
 * if (error._tag === "QueryDetailError") console.error(error.message);
 */
export class QueryDetailError extends Schema.TaggedError<QueryDetailError>()("QueryDetailError", {
  message: Schema.String,
}) {}
/**
 * Creates the local query API from an injectable index service.
 * The returned operations retain the supplied index; its runtime owns closing it.
 * @param options - Page bounds and redaction policy.
 * @returns An Effect with query operations or tagged invalid-bound failure.
 * @example
 * const query = Effect.runSync(makeObservabilityQueryEffect({ maxPageSize: 100 }).pipe(
 *   Effect.provide(queryIndexLayer(index)),
 * ));
 */
export const makeObservabilityQueryEffect = Effect.fn("ObservabilityQuery.create")(
  (options: ObservabilityQueryOptions = {}) =>
    observe(
      "create",
      Effect.gen(function* () {
        const index = yield* QueryIndexService;
        const maxPageSize = yield* positiveQueryEffect(
          options.maxPageSize ?? options.pageSize ?? 100,
        );
        const detailBound = options.maxDetailRecords ?? MAX_EXECUTION_RECORDS;
        if (!Number.isSafeInteger(detailBound) || detailBound < 1)
          return yield* Effect.fail(
            new QueryDetailError({ message: "Detail bound must be positive" }),
          );
        const maxDetailRecords = Math.min(detailBound, MAX_EXECUTION_RECORDS);
        const provide = <A, E>(effect: Effect.Effect<A, E, QueryIndexService>) =>
          effect.pipe(Effect.provideService(QueryIndexService, index));
        const requests = Effect.fn("ObservabilityQuery.requests")(
          (query: ObservabilityQueryRequest = {}) =>
            observe(
              "requests",
              provide(
                Effect.gen(function* () {
                  const page = yield* readPageEffect<RequestRecord>(
                    query,
                    maxPageSize,
                    options.redaction,
                    "request",
                  );
                  const current = new Map<string, RequestRecord>();
                  for (const request of page.items) {
                    const prior = current.get(request.requestId);
                    if (
                      prior === undefined ||
                      (prior.phase === "started" && request.phase === "completed")
                    )
                      current.set(request.requestId, request);
                  }
                  return Object.freeze({ ...page, items: Object.freeze([...current.values()]) });
                }),
              ),
            ),
        );
        const logs = Effect.fn("ObservabilityQuery.logs")((query: ObservabilityQueryRequest = {}) =>
          observe(
            "logs",
            provide(readPageEffect<LogQueryItem>(query, maxPageSize, options.redaction, "log")),
          ),
        );
        const traces = Effect.fn("ObservabilityQuery.traces")(
          (query: ObservabilityQueryRequest = {}) =>
            observe(
              "traces",
              provide(
                readPageEffect<TraceQueryItem>(
                  query,
                  maxPageSize,
                  options.redaction,
                  undefined,
                  (record: ObservabilityRecord) =>
                    record.signal === "trace" ||
                    record.signal === "span" ||
                    (query.traceId === undefined && record.signal === "request"),
                  query.traceId === undefined && query.search === undefined ? "traces" : "records",
                ),
              ),
            ),
        );
        const request = Effect.fn("ObservabilityQuery.request")((id: string) =>
          observe("request", provide(requestDetailEffect(id, maxDetailRecords, options))),
        );
        const log = Effect.fn("ObservabilityQuery.log")((cursor: string) =>
          observe("log", provide(logDetailEffect(cursor, maxPageSize, options))),
        );
        const trace = Effect.fn("ObservabilityQuery.trace")((id: string) =>
          observe("trace", provide(traceDetailEffect(id, maxDetailRecords, options))),
        );
        return Object.freeze({ requests, logs, traces, request, log, trace });
      }),
    ),
);
