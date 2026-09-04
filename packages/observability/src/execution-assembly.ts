import type { ObservabilityRecord, RequestRecord, SpanRecord, TraceRecord } from "./model.js";

export const MAX_EXECUTION_RECORDS = 2_000;
export const MAX_CONTINUATION_TRACES = 100;
export const MAX_EXECUTION_DEPTH = 64;

export interface SpanNode {
  readonly span: SpanRecord;
  readonly children: readonly SpanNode[];
}
export interface RequestExecutionDetail {
  readonly request: RequestRecord;
  readonly spans: readonly SpanRecord[];
  readonly roots: readonly SpanNode[];
  readonly continuations: readonly { readonly traceId: string; readonly active: boolean }[];
  readonly records: readonly ObservabilityRecord[];
  readonly counts: {
    readonly records: number;
    readonly spans: number;
    readonly continuations: number;
  };
  readonly incomplete: readonly string[];
}

export function assembleRequestExecution(
  records: readonly ObservabilityRecord[],
  requestId: string,
): RequestExecutionDetail | undefined {
  const bounded = boundExecutionRecords(records);
  const requests = bounded.filter(
    (record): record is RequestRecord =>
      record.signal === "request" && record.requestId === requestId,
  );
  const request = requests
    .sort(
      (left, right) =>
        Number(left.phase === "completed") - Number(right.phase === "completed") ||
        Date.parse(left.startedAt) - Date.parse(right.startedAt),
    )
    .at(-1);
  if (!request) return undefined;
  const spans = coalesceSpans(
    bounded.filter((record): record is SpanRecord => record.signal === "span"),
  );
  const incomplete: string[] = [];
  if (records.length > bounded.length) incomplete.push("record-limit");
  if (request.phase !== "completed") incomplete.push("request-active");
  const roots = spanTree(spans, incomplete);
  const traceIds = [
    ...new Set(
      bounded.flatMap((record) =>
        record.originRequestId === requestId && record.traceId && record.traceId !== request.traceId
          ? [record.traceId]
          : [],
      ),
    ),
  ];
  if (traceIds.length > MAX_CONTINUATION_TRACES) incomplete.push("continuation-limit");
  const continuations = traceIds.slice(0, MAX_CONTINUATION_TRACES).map((traceId) => ({
    traceId,
    active: spans.some((span) => span.traceId === traceId && span.status !== "completed"),
  }));
  return Object.freeze({
    request,
    spans: Object.freeze(spans),
    roots,
    continuations: Object.freeze(continuations),
    records: Object.freeze(bounded),
    counts: Object.freeze({
      records: bounded.length,
      spans: spans.length,
      continuations: continuations.length,
    }),
    incomplete: Object.freeze([...new Set(incomplete)]),
  });
}

function boundExecutionRecords(records: readonly ObservabilityRecord[]): ObservabilityRecord[] {
  if (records.length <= MAX_EXECUTION_RECORDS) return [...records];
  const lifecycle = new Map<string, RequestRecord | SpanRecord>();
  const other: ObservabilityRecord[] = [];
  for (const record of records) {
    if (record.signal !== "request" && record.signal !== "span") {
      other.push(record);
      continue;
    }
    const key =
      record.signal === "request"
        ? `request:${record.requestId}`
        : `span:${record.traceId}:${record.spanId}`;
    const previous = lifecycle.get(key);
    if (previous === undefined || preferred(record, previous)) lifecycle.set(key, record);
  }
  return [...lifecycle.values(), ...other].slice(0, MAX_EXECUTION_RECORDS);
}

function preferred(next: RequestRecord | SpanRecord, current: RequestRecord | SpanRecord): boolean {
  if (next.signal === "span" && current.signal === "span") {
    return (
      rank(next) > rank(current) ||
      (rank(next) === rank(current) && next.revision > current.revision)
    );
  }
  if (next.signal !== "request" || current.signal !== "request") return false;
  if (next.phase !== current.phase) return next.phase === "completed";
  return (
    Date.parse(next.completedAt ?? next.startedAt) >
    Date.parse(current.completedAt ?? current.startedAt)
  );
}

export function coalesceSpans(spans: readonly SpanRecord[]): SpanRecord[] {
  const current = new Map<string, SpanRecord>();
  for (const span of spans) {
    const key = `${span.traceId}:${span.spanId}`;
    const previous = current.get(key);
    if (
      !previous ||
      rank(span) > rank(previous) ||
      (rank(span) === rank(previous) && span.revision > previous.revision)
    )
      current.set(key, span);
  }
  return [...current.values()].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  );
}

function rank(span: SpanRecord): number {
  return span.status === "completed" ? 2 : span.status === "updated" ? 1 : 0;
}

function spanTree(spans: readonly SpanRecord[], incomplete: string[]): readonly SpanNode[] {
  const byId = new Map(spans.map((span) => [`${span.traceId}:${span.spanId}`, span]));
  const children = new Map<string, SpanRecord[]>();
  const roots: SpanRecord[] = [];
  for (const span of spans) {
    const parentKey = span.parentSpanId && `${span.traceId}:${span.parentSpanId}`;
    if (!parentKey || !byId.has(parentKey)) {
      roots.push(span);
      if (parentKey) incomplete.push("missing-parent");
    } else {
      const values = children.get(parentKey) ?? [];
      values.push(span);
      children.set(parentKey, values);
    }
  }
  const visited = new Set<string>();
  const visit = (span: SpanRecord, path: Set<string>, depth: number): SpanNode => {
    const key = `${span.traceId}:${span.spanId}`;
    if (path.has(key)) {
      incomplete.push("cycle");
      return Object.freeze({ span, children: Object.freeze([]) });
    }
    if (depth >= MAX_EXECUTION_DEPTH) {
      incomplete.push("depth-limit");
      return Object.freeze({ span, children: Object.freeze([]) });
    }
    const next = new Set(path);
    next.add(key);
    visited.add(key);
    return Object.freeze({
      span,
      children: Object.freeze(
        (children.get(key) ?? []).map((child) => visit(child, next, depth + 1)),
      ),
    });
  };
  const nodes = roots.map((span) => visit(span, new Set(), 0));
  for (const span of spans) {
    const key = `${span.traceId}:${span.spanId}`;
    if (!visited.has(key)) nodes.push(visit(span, new Set(), 0));
  }
  return Object.freeze(nodes);
}

export function currentTrace(spans: readonly SpanRecord[], traces: readonly TraceRecord[] = []) {
  const currentSpans = coalesceSpans(spans);
  return { spans: Object.freeze(currentSpans), trace: traces.at(-1) };
}
