import { Effect } from "effect";
import type {
  LogDetailResponse,
  ObservabilityQueryOptions,
  TraceQueryItem,
} from "./query-types.js";
import { OBSERVABILITY_QUERY_PROTOCOL, OBSERVABILITY_QUERY_VERSION } from "./query-types.js";
import { assembleRequestExecutionEffect, coalesceSpansEffect } from "./execution-assembly.js";
import { collectQueryEffect } from "./query-page-effect.js";
import {
  findCursorEffect,
  safeReadEffect,
  type QueryIndexService,
  type QueryReadError,
} from "./query-read-effect.js";
import type { QueryValidationError } from "./query-validation-effect.js";
/**
 * Assembles one request detail from bounded request, origin, and trace reads.
 * Reads stay sequential to preserve the previous first-error precedence.
 * @param requestId - Request identity.
 * @param maximum - Maximum records per contributing query.
 * @param options - Query redaction policy.
 * @returns An Effect with versioned detail or undefined.
 * @example
 * const detail = yield* requestDetailEffect("request-1", 200, {});
 */
export const requestDetailEffect = Effect.fn("ObservabilityQuery.requestDetail")(
  (requestId: string, maximum: number, options: ObservabilityQueryOptions) =>
    Effect.gen(function* () {
      const requestRecords = yield* collectQueryEffect(
        { requestId, order: "desc" },
        maximum,
        options,
        (record) => record.signal === "request",
      );
      const originRecords = yield* collectQueryEffect(
        { originRequestId: requestId, order: "desc" },
        maximum,
        options,
      );
      const traceId = requestRecords.find((record) => record.signal === "request")?.traceId;
      const traceRecords =
        traceId === undefined
          ? []
          : yield* collectQueryEffect({ traceId, order: "desc" }, maximum, options);
      const records = [
        ...new Map(
          [...requestRecords, ...originRecords, ...traceRecords].map((record) => [
            JSON.stringify(record),
            record,
          ]),
        ).values(),
      ];
      const detail = yield* assembleRequestExecutionEffect(records, requestId);
      return detail === undefined
        ? undefined
        : Object.freeze({
            protocol: OBSERVABILITY_QUERY_PROTOCOL,
            version: OBSERVABILITY_QUERY_VERSION,
            ...detail,
          });
    }),
);
/**
 * Resolves one log cursor and returns a versioned detail response.
 * @param cursor - Target log cursor.
 * @param maxPageSize - Maximum index page size.
 * @param options - Query redaction policy.
 * @returns An Effect with log detail or undefined.
 * @example
 * const detail = yield* logDetailEffect("3", 100, {});
 */
export const logDetailEffect = Effect.fn("ObservabilityQuery.logDetail")(
  (
    cursor: string,
    maxPageSize: number,
    options: ObservabilityQueryOptions,
  ): Effect.Effect<
    LogDetailResponse | undefined,
    QueryReadError | QueryValidationError,
    QueryIndexService
  > =>
    Effect.gen(function* () {
      const entry = yield* findCursorEffect(cursor, maxPageSize, "log");
      const log =
        entry === undefined ? undefined : yield* safeReadEffect(entry, options.redaction, "log");
      return log?.signal === "log"
        ? {
            protocol: OBSERVABILITY_QUERY_PROTOCOL,
            version: OBSERVABILITY_QUERY_VERSION,
            log: { ...log, cursor },
          }
        : undefined;
    }),
);
/**
 * Collects and coalesces records for one trace detail response.
 * @param traceId - Trace identity.
 * @param maximum - Maximum contributing records.
 * @param options - Query redaction policy.
 * @returns An Effect with trace detail or undefined.
 * @example
 * const detail = yield* traceDetailEffect("trace-1", 200, {});
 */
export const traceDetailEffect = Effect.fn("ObservabilityQuery.traceDetail")(
  (traceId: string, maximum: number, options: ObservabilityQueryOptions) =>
    Effect.gen(function* () {
      const records = (yield* collectQueryEffect(
        { traceId, order: "desc" },
        maximum,
        options,
        (record) => record.signal === "trace" || record.signal === "span",
      )) as TraceQueryItem[];
      if (records.length === 0) return undefined;
      const trace = records.find((record) => record.signal === "trace");
      const spans = yield* coalesceSpansEffect(
        records.filter((record) => record.signal === "span"),
      );
      return Object.freeze({
        protocol: OBSERVABILITY_QUERY_PROTOCOL,
        version: OBSERVABILITY_QUERY_VERSION,
        ...(trace === undefined ? {} : { trace }),
        spans: Object.freeze(spans),
        records: Object.freeze(records),
      });
    }),
);
