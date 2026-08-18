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

export * from "./query-types.js";

export function createObservabilityQuery(
  index: Pick<ObservabilityIndex, "page" | "read">,
  options: ObservabilityQueryOptions = {},
): ObservabilityQuery {
  const maxPageSize = positive(options.maxPageSize ?? options.pageSize ?? 100);
  const maxDetailRecords = positive(options.maxDetailRecords ?? maxPageSize);
  const list = (
    query: ObservabilityQueryRequest,
    signal?: ObservabilitySignal,
    accept?: (record: ObservabilityRecord) => boolean,
  ) => readPage(index, query, maxPageSize, options.redaction, signal, accept);
  const requests = (query: ObservabilityQueryRequest = {}) =>
    list(query, "request") as Promise<RequestQueryResponse>;
  const logs = (query: ObservabilityQueryRequest = {}) =>
    list(query, "log") as Promise<LogQueryResponse>;
  const traces = (query: ObservabilityQueryRequest = {}) =>
    list(
      query,
      undefined,
      (record) => record.signal === "trace" || record.signal === "span",
    ) as Promise<TraceQueryResponse>;

  return Object.freeze({
    requests,
    logs,
    traces,
    request: async (requestId: string): Promise<RequestDetailResponse | undefined> => {
      const page = await requests({ requestId, limit: 1 });
      const request = page.items[0];
      if (request === undefined) return undefined;
      const records = await collect(
        index,
        { traceId: request.traceId, requestId },
        maxDetailRecords,
        options,
      );
      return Object.freeze({
        protocol: OBSERVABILITY_QUERY_PROTOCOL,
        version: OBSERVABILITY_QUERY_VERSION,
        request,
        records: Object.freeze([
          request,
          ...records.filter(
            (record) => record.signal !== "request" || record.requestId !== request.requestId,
          ),
        ]),
      });
    },
    log: async (cursor: string): Promise<LogDetailResponse | undefined> => {
      const entry = await findCursor(index, cursor, maxPageSize, "log");
      const log =
        entry === undefined ? undefined : await safeRead(index, entry, options.redaction, "log");
      return log?.signal === "log"
        ? { protocol: OBSERVABILITY_QUERY_PROTOCOL, version: OBSERVABILITY_QUERY_VERSION, log }
        : undefined;
    },
    trace: async (traceId: string): Promise<TraceDetailResponse | undefined> => {
      const records = (await collect(
        index,
        { traceId },
        maxDetailRecords,
        options,
        (record) => record.signal === "trace" || record.signal === "span",
      )) as TraceQueryItem[];
      if (records.length === 0) return undefined;
      const trace = records.find((record) => record.signal === "trace");
      const spans = records.filter((record) => record.signal === "span");
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
