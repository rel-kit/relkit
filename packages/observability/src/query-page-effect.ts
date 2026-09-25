import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { ObservabilityRecord, ObservabilitySignal } from "./model.js";
import type { RedactionPolicy } from "./redaction.types.js";
import type { RedactedObservabilityRecord } from "./record-admission.types.js";
import type { ObservabilityIndexPageOptions } from "./storage/index.types.js";
import type { NormalizedQuery } from "./query-validation.types.js";
import type { ObservabilityQueryPage, ObservabilityQueryRequest } from "./query-types.js";
import { QueryIndexService, QueryReadError, safeReadEffect } from "./query-read-effect.js";
import {
  inQueryTimeRangeEffect,
  matchesQueryEffect,
  queryResponseEffect,
  validateQueryEffect,
} from "./query-validation-effect.js";
function observe<A, E, R>(
  operation: "readPage" | "collect",
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_query_pages_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_query_page_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Reads a bounded page in index order and re-admits each candidate record.
 * Page cursors are sequential because each page depends on the prior cursor.
 * @param input - Query filters and cursor.
 * @param maxPageSize - Maximum index page size.
 * @param redaction - Optional query redaction policy.
 * @param signal - Optional required record signal.
 * @param accept - Optional predicate for supported records.
 * @param pageKind - Record or trace index.
 * @returns An Effect with a versioned page or tagged read/validation failure.
 * @example
 * const page = yield* readPageEffect({ limit: 10 }, 100);
 */
export const readPageEffect = Effect.fn("ObservabilityQuery.readPage")(
  <T extends ObservabilityRecord>(
    input: ObservabilityQueryRequest,
    maxPageSize: number,
    redaction?: RedactionPolicy,
    signal?: ObservabilitySignal,
    accept: (record: ObservabilityRecord) => boolean = (record) =>
      signal === undefined || record.signal === signal,
    pageKind: "records" | "traces" = "records",
  ): Effect.Effect<
    ObservabilityQueryPage<T>,
    QueryReadError | import("./query-validation-effect.js").QueryValidationError,
    QueryIndexService
  > =>
    observe(
      "readPage",
      Effect.gen(function* () {
        const index = yield* QueryIndexService;
        const query = yield* validateQueryEffect(input, maxPageSize);
        const items: T[] = [];
        let cursor = query.cursor;
        let lastCursor: string | undefined;
        while (true) {
          const page = yield* Effect.try({
            try: () =>
              (pageKind === "traces" ? index.tracePage : index.page)(
                indexOptions(query, cursor, maxPageSize, signal),
              ),
            catch: (cause) => new QueryReadError({ reason: "index", cause }),
          });
          for (const entry of page.entries) {
            if (!(yield* inQueryTimeRangeEffect(entry.timestamp, query)) || entry.cursor === cursor)
              continue;
            const record = yield* safeReadEffect(entry, redaction);
            if (
              record === undefined ||
              !accept(record) ||
              !(yield* matchesQueryEffect(record, query))
            )
              continue;
            if (items.length === query.limit) return yield* queryResponseEffect(items, lastCursor);
            items.push(
              (record.signal === "log"
                ? { ...record, cursor: entry.cursor }
                : record) as unknown as T,
            );
            lastCursor = entry.cursor;
          }
          if (page.nextCursor === undefined || page.nextCursor === cursor) break;
          cursor = page.nextCursor;
        }
        return yield* queryResponseEffect(items);
      }),
    ),
);
/**
 * Collects admitted records for one bounded detail query.
 * @param input - Query filters.
 * @param maximum - Maximum number of records.
 * @param options - Optional redaction policy.
 * @param accept - Optional record predicate.
 * @returns An Effect with admitted records or tagged query failure.
 * @example
 * const records = yield* collectQueryEffect({ requestId }, 200, {});
 */
export const collectQueryEffect = Effect.fn("ObservabilityQuery.collect")(
  (
    input: ObservabilityQueryRequest,
    maximum: number,
    options: { readonly redaction?: RedactionPolicy },
    accept?: (record: ObservabilityRecord) => boolean,
  ) =>
    observe(
      "collect",
      readPageEffect<RedactedObservabilityRecord>(
        { ...input, limit: maximum },
        maximum,
        options.redaction,
        undefined,
        accept ?? (() => true),
      ).pipe(Effect.map((page) => [...page.items])),
    ),
);
function indexOptions(
  query: NormalizedQuery,
  cursor: string | undefined,
  maxPageSize: number,
  signal: ObservabilitySignal | undefined,
): ObservabilityIndexPageOptions {
  return {
    ...(signal === undefined ? {} : { signal }),
    ...(cursor === undefined ? {} : { cursor }),
    limit: maxPageSize,
    ...(query.order === undefined ? {} : { order: query.order }),
    ...(query.severity === undefined ? {} : { severity: query.severity }),
    ...(query.routeId === undefined ? {} : { routeId: query.routeId }),
    ...(query.functionId === undefined ? {} : { functionId: query.functionId }),
    ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
    ...(query.requestId === undefined ? {} : { requestId: query.requestId }),
    ...(query.originRequestId === undefined ? {} : { originRequestId: query.originRequestId }),
    ...(query.traceId === undefined ? {} : { traceId: query.traceId }),
    ...(query.spanId === undefined ? {} : { spanId: query.spanId }),
    ...(query.serviceId === undefined ? {} : { serviceId: query.serviceId }),
    ...(query.generationId === undefined ? {} : { generationId: query.generationId }),
    ...(query.graphHash === undefined ? {} : { graphHash: query.graphHash }),
  };
}
