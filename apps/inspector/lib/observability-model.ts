import type { InspectorObject, InspectorQuery } from "./api-types";
import type { StreamEvent } from "./stream-protocol";

export type SignalKind = "requests" | "logs" | "traces";

export interface SignalFilters {
  readonly from: string;
  readonly to: string;
  readonly severity: string;
  readonly routeId: string;
  readonly functionId: string;
  readonly outcome: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly serviceId: string;
}

export const EMPTY_SIGNAL_FILTERS: SignalFilters = Object.freeze({
  from: "",
  to: "",
  severity: "",
  routeId: "",
  functionId: "",
  outcome: "",
  requestId: "",
  traceId: "",
  serviceId: "",
});

export function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

export function records(value: unknown): readonly InspectorObject[] {
  return Array.isArray(value) ? value.flatMap((item) => (record(item) ? [record(item)!] : [])) : [];
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function queryFromFilters(
  filters: SignalFilters,
  limit: number,
  cursor?: string,
): InspectorQuery {
  const from = iso(filters.from);
  const to = iso(filters.to);
  const pageSize = Number.isFinite(limit) ? Math.trunc(limit) : 50;
  return {
    limit: Math.min(Math.max(1, pageSize), 100),
    ...(cursor === undefined ? {} : { cursor }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(filters.severity === "" ? {} : { severity: filters.severity }),
    ...(filters.routeId === "" ? {} : { routeId: filters.routeId }),
    ...(filters.functionId === "" ? {} : { functionId: filters.functionId }),
    ...(filters.outcome === "" ? {} : { outcome: filters.outcome }),
    ...(filters.requestId === "" ? {} : { requestId: filters.requestId }),
    ...(filters.traceId === "" ? {} : { traceId: filters.traceId }),
    ...(filters.serviceId === "" ? {} : { serviceId: filters.serviceId }),
  };
}

export function eventRecord(value: unknown): InspectorObject | undefined {
  const event = record(value);
  const payload = event?.data ?? value;
  const payloadRecord = record(payload);
  const candidate = record(payloadRecord?.record) ?? payloadRecord;
  return typeof candidate?.signal === "string" ? candidate : undefined;
}

export function mergeLiveItems(
  items: readonly InspectorObject[],
  event: StreamEvent | unknown,
): readonly InspectorObject[] {
  const next = eventRecord(event);
  if (next === undefined) return items;
  const key = signalKey(next);
  return [next, ...items.filter((item) => signalKey(item) !== key)];
}

export function matchesQuery(value: InspectorObject, query: InspectorQuery): boolean {
  const timestamp = text(value.timestamp) || text(value.startedAt) || text(value.occurredAt);
  const time = Date.parse(timestamp);
  return (
    matches(value, query.routeId, "routeId") &&
    matches(value, query.functionId, "functionId") &&
    matches(value, query.outcome, "outcome") &&
    matches(value, query.traceId, "traceId") &&
    matches(value, query.serviceId, "serviceId") &&
    (query.requestId === undefined ||
      value.requestId === query.requestId ||
      value.correlationId === query.requestId) &&
    (query.severity === undefined ||
      value.level === query.severity ||
      value.severity === query.severity) &&
    (query.from === undefined || (Number.isFinite(time) && time >= Date.parse(query.from))) &&
    (query.to === undefined || (Number.isFinite(time) && time <= Date.parse(query.to)))
  );
}

export function signalKey(value: InspectorObject): string {
  const signal = text(value.signal);
  const id =
    (signal === "span" ? text(value.spanId) : "") ||
    (signal === "trace" ? text(value.traceId) : "") ||
    (signal === "request" ? text(value.requestId) : "") ||
    (signal === "log" ? text(value.cursor) : "") ||
    text(value.id);
  return `${signal}:${id || JSON.stringify(value)}`;
}

function matches(value: InspectorObject, expected: string | undefined, key: string): boolean {
  return expected === undefined || value[key] === expected;
}

function iso(value: string): string | undefined {
  if (value === "") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function byTime(left: InspectorObject, right: InspectorObject): number {
  return (
    (Date.parse(text(left.startedAt) || text(left.timestamp) || text(left.occurredAt)) || 0) -
      (Date.parse(text(right.startedAt) || text(right.timestamp) || text(right.occurredAt)) || 0) ||
    text(left.spanId).localeCompare(text(right.spanId))
  );
}

export { traceGroups, waterfall } from "./observability-trace-model";
export type { TraceGroup, WaterfallSpan } from "./observability-trace-model";
