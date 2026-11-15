import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { ObservabilityRecord, ObservabilitySignal } from "./model.js";
import type { RedactionPolicy } from "./redaction.types.js";
import type { RedactedObservabilityRecord } from "./record-admission.types.js";
import type { ObservabilityIndexPageOptions } from "./storage/index.types.js";
import type { NormalizedQuery } from "./query-validation.types.js";
import type { ObservabilityQueryPage, ObservabilityQueryRequest } from "./query-types.js";
import { QueryIndexService, QueryReadError, safeReadEffect } from "./query-read-effect.js";
import { countRequested } from "./query-request-filters.js";
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
        const query = yield* validateQueryEffect(input, maxPageSize);
        const scan = { query, maxPageSize, redaction, signal, accept, pageKind };
        const page = yield* readItems<T>(scan);
        if (!countRequested(query)) return page;
        // The total ignores the cursor: it counts every record the filters select.
        const { cursor: _cursor, ...uncursored } = query;
        const total = yield* countMatches({ ...scan, query: uncursored });
        return Object.freeze({ ...page, total });
      }),
    ),
);
/** Validated query and the index scan settings shared by a page read and its count. */
interface PageScan {
  readonly query: NormalizedQuery;
  readonly maxPageSize: number;
  readonly redaction: RedactionPolicy | undefined;
  readonly signal: ObservabilitySignal | undefined;
  readonly accept: (record: ObservabilityRecord) => boolean;
  readonly pageKind: "records" | "traces";
}
/**
 * Visits every admitted record matching a scan in index order until the visitor stops it.
 * @param scan - Validated query and index settings.
 * @param visit - Receives each match with its index cursor; returns false to stop.
 * @returns An Effect completing after the last visited match.
 */
const scanMatches = Effect.fn("ObservabilityQuery.scan")(function* (
  scan: PageScan,
  visit: (record: ObservabilityRecord, cursor: string) => boolean,
) {
  const index = yield* QueryIndexService;
  const { query } = scan;
  let cursor = query.cursor;
  while (true) {
    const page = yield* Effect.try({
      try: () =>
        (scan.pageKind === "traces" ? index.tracePage : index.page)(
          indexOptions(query, cursor, scan.maxPageSize, scan.signal),
        ),
      catch: (cause) => new QueryReadError({ reason: "index", cause }),
    });
    for (const entry of page.entries) {
      if (!(yield* inQueryTimeRangeEffect(entry.timestamp, query)) || entry.cursor === cursor)
        continue;
      const record = yield* safeReadEffect(entry, scan.redaction);
      if (
        record === undefined ||
        !scan.accept(record) ||
        !(yield* matchesQueryEffect(record, query))
      )
        continue;
      if (!visit(record, entry.cursor)) return;
    }
    if (page.nextCursor === undefined || page.nextCursor === cursor) return;
    cursor = page.nextCursor;
  }
});
/**
 * Reads one page of matches; a further match makes the last item's cursor the next cursor.
 * @param scan - Validated query and index settings.
 * @returns An Effect with the versioned page.
 */
function readItems<T>(scan: PageScan) {
  return Effect.gen(function* () {
    const items: T[] = [];
    let lastCursor: string | undefined;
    let more = false;
    yield* scanMatches(scan, (record, cursor) => {
      if (items.length === scan.query.limit) {
        more = true;
        return false;
      }
      items.push((record.signal === "log" ? { ...record, cursor } : record) as unknown as T);
      lastCursor = cursor;
      return true;
    });
    return yield* queryResponseEffect(items, more ? lastCursor : undefined);
  });
}
/**
 * Counts every match of a scan.
 * @param scan - Validated query and index settings, without a cursor.
 * @returns An Effect with the number of matching records.
 */
function countMatches(scan: PageScan) {
  return Effect.gen(function* () {
    let total = 0;
    yield* scanMatches(scan, () => {
      total += 1;
      return true;
    });
    return total;
  });
}
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
