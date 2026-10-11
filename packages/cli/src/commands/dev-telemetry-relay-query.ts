import {
  createObservabilityQuery,
  type ObservabilityIndexEntry,
  type ObservabilityIndexPage,
  type ObservabilityIndexPageOptions,
  type ObservabilityQuery,
  type RedactedObservabilityRecord,
} from "@relkit/observability";
import { readObservabilityQuery, streamResponse } from "@relkit/inspector-api";
import { Effect } from "effect";
import type { EarlyRetainedRecord } from "@relkit/observability/early";
import type { DevTelemetryRelayState } from "./dev-telemetry-relay.types.js";

/** Serves retained startup history before canonical persistence is ready. */
export async function handleEarlyInspector(
  state: DevTelemetryRelayState,
  request: Request,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/_relkit/v1/stream") return streamResponse(state.stream, request, 1);
  const entries = await Effect.runPromise(state.buffer.snapshot());
  const query = retainedQuery(entries);
  const match = /^\/_relkit\/v1\/(logs|requests|traces)(?:\/([^/]+))?$/u.exec(pathname);
  if (match === null) return response({ error: "RELKIT_OBSERVABILITY_NOT_FOUND" }, 404);
  try {
    const collection = match[1] as "logs" | "requests" | "traces";
    const id = match[2];
    const value =
      id === undefined
        ? await query[collection](readObservabilityQuery(request))
        : await query[
            collection === "logs" ? "log" : collection === "requests" ? "request" : "trace"
          ](decodeURIComponent(id));
    return value === undefined
      ? response({ error: "RELKIT_OBSERVABILITY_NOT_FOUND" }, 404)
      : response(value);
  } catch {
    return response({ error: "RELKIT_OBSERVABILITY_QUERY_INVALID" }, 400);
  }
}

function retainedQuery(retained: readonly EarlyRetainedRecord[]): ObservabilityQuery {
  const records = new Map(retained.map((entry) => [String(entry.sequence), entry.record]));
  const entries = retained.map(indexEntry);
  return createObservabilityQuery({
    page: (options = {}) => page(entries, options),
    tracePage: (options = {}) => tracePage(entries, options),
    read: async (entry) => records.get(entry.cursor),
  });
}

function indexEntry(entry: EarlyRetainedRecord): ObservabilityIndexEntry {
  const record = entry.record as RedactedObservabilityRecord & Record<string, unknown>;
  const timestamp = [record.timestamp, record.startedAt, record.occurredAt].find(
    (value): value is string => typeof value === "string",
  );
  if (timestamp === undefined) throw new TypeError("Retained record has no timestamp");
  return {
    cursor: String(entry.sequence),
    signal: entry.record.signal,
    segment: "early",
    offset: entry.sequence,
    bytes: entry.bytes,
    timestamp,
    ...textFields(record),
    ...(typeof record.level !== "string"
      ? {}
      : { severity: record.level as NonNullable<ObservabilityIndexEntry["severity"]> }),
  };
}

function textFields(record: Record<string, unknown>): Partial<ObservabilityIndexEntry> {
  return Object.fromEntries(
    [
      "requestId",
      "originRequestId",
      "traceId",
      "spanId",
      "routeId",
      "functionId",
      "serviceId",
      "outcome",
      "generationId",
      "graphHash",
    ].flatMap((key) => (typeof record[key] === "string" ? [[key, record[key]]] : [])),
  );
}

function page(
  source: readonly ObservabilityIndexEntry[],
  options: ObservabilityIndexPageOptions,
): ObservabilityIndexPage {
  const descending = options.order === "desc";
  const cursor =
    options.cursor === undefined ? (descending ? Infinity : 0) : cursorValue(options.cursor);
  const matches = source
    .filter((entry) => (descending ? Number(entry.cursor) < cursor : Number(entry.cursor) > cursor))
    .filter((entry) => matchesEntry(entry, options))
    .sort((left, right) => Number(left.cursor) - Number(right.cursor));
  if (descending) matches.reverse();
  const limit = Math.min(options.limit ?? 50, 100);
  const entries = matches.slice(0, limit);
  return {
    entries,
    ...(matches.length <= limit ? {} : { nextCursor: entries.at(-1)!.cursor }),
  };
}

function tracePage(
  source: readonly ObservabilityIndexEntry[],
  options: ObservabilityIndexPageOptions,
): ObservabilityIndexPage {
  const representatives = new Map<string, ObservabilityIndexEntry>();
  for (const entry of source) {
    if (
      entry.traceId === undefined ||
      !(entry.signal === "request" || entry.signal === "trace" || entry.signal === "span")
    )
      continue;
    const current = representatives.get(entry.traceId);
    if (current === undefined || tracePriority(entry) > tracePriority(current))
      representatives.set(entry.traceId, entry);
  }
  return page([...representatives.values()], options);
}

function matchesEntry(
  entry: ObservabilityIndexEntry,
  options: ObservabilityIndexPageOptions,
): boolean {
  if (options.signal !== undefined && entry.signal !== options.signal) return false;
  for (const key of [
    "routeId",
    "functionId",
    "outcome",
    "requestId",
    "originRequestId",
    "traceId",
    "spanId",
    "serviceId",
    "generationId",
    "graphHash",
    "severity",
  ] as const)
    if (options[key] !== undefined && entry[key] !== options[key]) return false;
  return true;
}

function cursorValue(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError("Invalid cursor");
  return parsed;
}

function tracePriority(entry: ObservabilityIndexEntry): number {
  return entry.signal === "request" ? 3 : entry.signal === "trace" ? 2 : 1;
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", "x-relkit-api-version": "1" },
  });
}
