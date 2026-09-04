import type { ObservabilityRecord, ObservabilitySignal } from "./model.js";
import { admitObservabilityRecord } from "./record-admission.js";
import type { RedactionPolicy } from "./redaction.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type {
  ObservabilityIndex,
  ObservabilityIndexEntry,
  ObservabilityIndexPageOptions,
} from "./storage/index.js";
import { type ObservabilityQueryPage, type ObservabilityQueryRequest } from "./query-types.js";
import {
  inTimeRange,
  matches,
  type NormalizedQuery,
  response,
  validate,
} from "./query-validation.js";

type Index = Pick<ObservabilityIndex, "page" | "tracePage" | "read">;

export async function readPage<T extends ObservabilityRecord>(
  index: Index,
  input: ObservabilityQueryRequest,
  maxPageSize: number,
  redaction: RedactionPolicy | undefined,
  signal?: ObservabilitySignal,
  accept: (record: ObservabilityRecord) => boolean = (record) =>
    signal === undefined || record.signal === signal,
  pageKind: "records" | "traces" = "records",
): Promise<ObservabilityQueryPage<T>> {
  const query = validate(input, maxPageSize);
  const items: T[] = [];
  let cursor = query.cursor;
  let lastCursor: string | undefined;
  while (true) {
    const page = (pageKind === "traces" ? index.tracePage : index.page)(
      indexOptions(query, cursor, maxPageSize, signal),
    );
    for (const entry of page.entries) {
      if (!inTimeRange(entry.timestamp, query) || entry.cursor === cursor) continue;
      const record = await safeRead(index, entry, redaction);
      if (record === undefined || !accept(record) || !matches(record, query)) continue;
      if (items.length === query.limit) return response(items, lastCursor);
      items.push(
        (record.signal === "log" ? { ...record, cursor: entry.cursor } : record) as unknown as T,
      );
      lastCursor = entry.cursor;
    }
    if (page.nextCursor === undefined || page.nextCursor === cursor) break;
    cursor = page.nextCursor;
  }
  return response(items);
}

export async function collect(
  index: Index,
  input: ObservabilityQueryRequest,
  maximum: number,
  options: { readonly redaction?: RedactionPolicy },
  accept?: (record: ObservabilityRecord) => boolean,
): Promise<RedactedObservabilityRecord[]> {
  const page = await readPage<RedactedObservabilityRecord>(
    index,
    { ...input, limit: maximum },
    maximum,
    options.redaction,
    undefined,
    accept ?? (() => true),
  );
  return [...page.items];
}

export async function findCursor(
  index: Index,
  cursor: string,
  maxPageSize: number,
  signal: ObservabilitySignal,
): Promise<ObservabilityIndexEntry | undefined> {
  validate({ cursor, limit: 1 }, maxPageSize);
  let after: string | undefined;
  while (true) {
    const page = index.page({
      signal,
      ...(after === undefined ? {} : { cursor: after }),
      limit: maxPageSize,
    });
    const found = page.entries.find((entry) => entry.cursor === cursor);
    if (found !== undefined) return found;
    if (page.nextCursor === undefined || page.nextCursor === after) return undefined;
    after = page.nextCursor;
  }
}

export async function safeRead(
  index: Index,
  entry: ObservabilityIndexEntry,
  redaction: RedactionPolicy | undefined,
  signal?: ObservabilitySignal,
): Promise<RedactedObservabilityRecord | undefined> {
  const value = await index.read(entry);
  if (value === undefined || (signal !== undefined && value.signal !== signal)) return undefined;
  const safe = admitObservabilityRecord(value, redaction);
  return isRecord(safe) && safe.version === value.version && typeof safe.signal === "string"
    ? safe
    : undefined;
}

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

function isRecord(
  value: unknown,
): value is { readonly version?: unknown; readonly signal?: unknown } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
