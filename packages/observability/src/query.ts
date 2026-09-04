import type { ObservabilityRecord, ObservabilitySignal } from "./model.js";
import { collect, findCursor, readPage, safeRead } from "./query-utils.js";
import { positive } from "./query-validation.js";
import {
  type LogDetailResponse,
  type LogQueryResponse,
  OBSERVABILITY_QUERY_PROTOCOL,
  OBSERVABILITY_QUERY_VERSION,
  type ObservabilityQuery,
  type ObservabilityQueryOptions,
  type ObservabilityQueryRequest,
  type RequestDetailResponse,
  type RequestQueryResponse,
  type TraceDetailResponse,
  type TraceQueryItem,
  type TraceQueryResponse,
} from "./query-types.js";
import type { ObservabilityIndex } from "./storage/index.js";
import {
  assembleRequestExecution,
  coalesceSpans,
  MAX_EXECUTION_RECORDS,
} from "./execution-assembly.js";

export * from "./query-types.js";

export function createObservabilityQuery(
  index: Pick<ObservabilityIndex, "page" | "tracePage" | "read">,
  options: ObservabilityQueryOptions = {},
): ObservabilityQuery {
  const maxPageSize = positive(options.maxPageSize ?? options.pageSize ?? 100);
  const maxDetailRecords = Math.min(
    positiveDetail(options.maxDetailRecords ?? MAX_EXECUTION_RECORDS),
    MAX_EXECUTION_RECORDS,
  );
  const list = (
    query: ObservabilityQueryRequest,
    signal?: ObservabilitySignal,
    accept?: (record: ObservabilityRecord) => boolean,
    pageKind: "records" | "traces" = "records",
  ) => readPage(index, query, maxPageSize, options.redaction, signal, accept, pageKind);
  const requests = async (query: ObservabilityQueryRequest = {}): Promise<RequestQueryResponse> => {
    const page = (await list(query, "request")) as RequestQueryResponse;
    const current = new Map<string, RequestQueryResponse["items"][number]>();
    for (const request of page.items) {
      const prior = current.get(request.requestId);
      if (prior === undefined || (prior.phase === "started" && request.phase === "completed")) {
        current.set(request.requestId, request);
      }
    }
    return Object.freeze({ ...page, items: Object.freeze([...current.values()]) });
  };
  const logs = (query: ObservabilityQueryRequest = {}) =>
    list(query, "log") as Promise<LogQueryResponse>;
  const traces = (query: ObservabilityQueryRequest = {}) =>
    list(
      query,
      undefined,
      (record) =>
        record.signal === "trace" ||
        record.signal === "span" ||
        (query.traceId === undefined && record.signal === "request"),
      query.traceId === undefined && query.search === undefined ? "traces" : "records",
    ) as Promise<TraceQueryResponse>;

  return Object.freeze({
    requests,
    logs,
    traces,
    request: async (requestId: string): Promise<RequestDetailResponse | undefined> => {
      const requestRecords = await collect(
        index,
        { requestId, order: "desc" },
        maxDetailRecords,
        options,
        (record) => record.signal === "request",
      );
      const originRecords = await collect(
        index,
        { originRequestId: requestId, order: "desc" },
        maxDetailRecords,
        options,
      );
      const traceId = requestRecords.find((record) => record.signal === "request")?.traceId;
      const traceRecords =
        traceId === undefined
          ? []
          : await collect(index, { traceId, order: "desc" }, maxDetailRecords, options);
      const records = [
        ...new Map(
          [...requestRecords, ...originRecords, ...traceRecords].map((record) => [
            JSON.stringify(record),
            record,
          ]),
        ).values(),
      ];
      const detail = assembleRequestExecution(records, requestId);
      if (!detail) return undefined;
      return Object.freeze({
        protocol: OBSERVABILITY_QUERY_PROTOCOL,
        version: OBSERVABILITY_QUERY_VERSION,
        ...detail,
      });
    },
    log: async (cursor: string): Promise<LogDetailResponse | undefined> => {
      const entry = await findCursor(index, cursor, maxPageSize, "log");
      const log =
        entry === undefined ? undefined : await safeRead(index, entry, options.redaction, "log");
      return log?.signal === "log"
        ? {
            protocol: OBSERVABILITY_QUERY_PROTOCOL,
            version: OBSERVABILITY_QUERY_VERSION,
            log: { ...log, cursor },
          }
        : undefined;
    },
    trace: async (traceId: string): Promise<TraceDetailResponse | undefined> => {
      const records = (await collect(
        index,
        { traceId, order: "desc" },
        maxDetailRecords,
        options,
        (record) => record.signal === "trace" || record.signal === "span",
      )) as TraceQueryItem[];
      if (records.length === 0) return undefined;
      const trace = records.find((record) => record.signal === "trace");
      const spans = coalesceSpans(records.filter((record) => record.signal === "span"));
      return Object.freeze({
        protocol: OBSERVABILITY_QUERY_PROTOCOL,
        version: OBSERVABILITY_QUERY_VERSION,
        ...(trace === undefined ? {} : { trace }),
        spans: Object.freeze(spans),
        records: Object.freeze(records),
      });
    },
  });
}

function positiveDetail(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError("Detail bound must be positive");
  return value;
}
