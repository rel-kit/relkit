import type { InspectorObject } from "./api-types";

export interface TraceGroup {
  readonly traceId: string;
  readonly trace?: InspectorObject;
  readonly spans: readonly InspectorObject[];
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly outcome?: string;
}

export interface WaterfallSpan {
  readonly spanId: string;
  readonly name: string;
  readonly parentSpanId?: string;
  readonly depth: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly status?: string;
  readonly outcome?: string;
  readonly kind: string;
  readonly error: boolean;
  readonly details: InspectorObject;
  readonly correlations: readonly TraceCorrelation[];
  readonly offsetPercent: number;
  readonly widthPercent: number;
}

export interface TraceCorrelation {
  readonly kind: "request" | "job" | "event";
  readonly id: string;
  readonly href: string;
}

export function traceGroups(items: readonly InspectorObject[]): readonly TraceGroup[] {
  const groups = new Map<string, { trace?: InspectorObject; spans: InspectorObject[] }>();
  for (const item of items) {
    const traceId = text(item.traceId);
    if (traceId === "") continue;
    const group = groups.get(traceId) ?? { spans: [] };
    if (item.signal === "trace") group.trace = item;
    if (item.signal === "span" || text(item.spanId) !== "") group.spans.push(item);
    groups.set(traceId, group);
  }
  return [...groups.entries()]
    .map(([traceId, group]) => {
      const trace = group.trace;
      const startedAt = text(trace?.startedAt);
      const completedAt = text(trace?.completedAt);
      const durationMs = number(trace?.durationMs);
      const outcome = text(trace?.outcome);
      return {
        traceId,
        ...(trace === undefined ? {} : { trace }),
        spans: group.spans.sort(byTime),
        ...(startedAt === "" ? {} : { startedAt }),
        ...(completedAt === "" ? {} : { completedAt }),
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(outcome === "" ? {} : { outcome }),
      };
    })
    .sort((left, right) => left.traceId.localeCompare(right.traceId));
}

export function waterfall(spans: readonly InspectorObject[]): readonly WaterfallSpan[] {
  const valid = spans.filter((span) => text(span.spanId) !== "");
  let origin = Number.POSITIVE_INFINITY;
  for (const span of valid) {
    const start = Date.parse(text(span.startedAt));
    if (Number.isFinite(start)) origin = Math.min(origin, start);
  }
  if (!Number.isFinite(origin)) origin = 0;
  let total = 1;
  for (const span of valid) {
    const start = Date.parse(text(span.startedAt));
    const end = (Number.isFinite(start) ? start : origin) + (number(span.durationMs) ?? 0);
    total = Math.max(total, end - origin);
  }
  const parents = new Map(valid.map((span) => [text(span.spanId), text(span.parentSpanId)]));
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const parent = parents.get(id);
    if (parent === undefined || parent === "" || seen.has(parent)) return 0;
    seen.add(parent);
    return Math.min(8, depthOf(parent, seen) + 1);
  };
  const isAncestor = (ancestor: string, descendant: string): boolean => {
    const seen = new Set<string>();
    let parent = parents.get(descendant);
    while (parent && !seen.has(parent)) {
      if (parent === ancestor) return true;
      seen.add(parent);
      parent = parents.get(parent);
    }
    return false;
  };
  return valid
    .sort((left, right) => {
      const leftId = text(left.spanId);
      const rightId = text(right.spanId);
      if (isAncestor(leftId, rightId)) return -1;
      if (isAncestor(rightId, leftId)) return 1;
      return byTime(left, right);
    })
    .map((span) => {
      const start = Date.parse(text(span.startedAt));
      const duration = Math.max(0, number(span.durationMs) ?? 0);
      const offset = Number.isFinite(start) ? ((start - origin) / total) * 100 : 0;
      const status = text(span.status);
      const outcome = text(span.outcome);
      return {
        spanId: text(span.spanId),
        name: text(span.name) || "span",
        ...(text(span.parentSpanId) ? { parentSpanId: text(span.parentSpanId) } : {}),
        depth: depthOf(text(span.spanId)),
        ...(text(span.startedAt) ? { startedAt: text(span.startedAt) } : {}),
        ...(text(span.completedAt) ? { completedAt: text(span.completedAt) } : {}),
        ...(number(span.durationMs) === undefined ? {} : { durationMs: duration }),
        ...(status ? { status } : {}),
        ...(outcome ? { outcome } : {}),
        kind: spanKind(span),
        error: /error|fail/i.test(`${status} ${outcome}`),
        details: safeDetails(span),
        correlations: correlations(span),
        offsetPercent: Math.max(0, Math.min(96, offset)),
        widthPercent: Math.max(4, Math.min(100 - Math.max(0, offset), (duration / total) * 100)),
      };
    });
}

function spanKind(span: InspectorObject): string {
  const value = text(span.spanKind) || text(span.kind);
  return value === "" || value === "span" ? "internal" : value;
}

function correlations(span: InspectorObject): readonly TraceCorrelation[] {
  return [
    link("request", span.requestId, "/requests/"),
    link("job", span.jobId, "/jobs/"),
    link("event", span.eventId, "/events/"),
  ].flatMap((value) => value ?? []);
}

function link(
  kind: TraceCorrelation["kind"],
  value: unknown,
  prefix: string,
): TraceCorrelation | undefined {
  const id = text(value);
  return id === "" ? undefined : { kind, id, href: `${prefix}${encodeURIComponent(id)}` };
}

function safeDetails(span: InspectorObject): InspectorObject {
  const details = redact({
    attributes: span.attributes,
    resourceAttributes: span.resourceAttributes ?? span.resource,
    logs: span.logs ?? span.events,
  });
  return isRecord(details) ? details : {};
}

function redact(value: unknown, key = "", depth = 0): unknown {
  if (
    /authorization|cookie|password|secret|token|api.?key|request.?body|response.?body/i.test(key)
  ) {
    return "[redacted]";
  }
  if (depth > 5) return "[truncated]";
  if (typeof value === "string") return value.length > 4_096 ? `${value.slice(0, 4_096)}…` : value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, key, depth + 1));
  if (!isRecord(value)) return undefined;
  const entries: [string, unknown][] = [];
  for (const [name, item] of Object.entries(value)) {
    if (entries.length === 100) break;
    entries.push([name, redact(item, name, depth + 1)]);
  }
  return Object.fromEntries(entries);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function byTime(left: InspectorObject, right: InspectorObject): number {
  return (
    (Date.parse(text(left.startedAt) || text(left.timestamp) || text(left.occurredAt)) || 0) -
      (Date.parse(text(right.startedAt) || text(right.timestamp) || text(right.occurredAt)) || 0) ||
    text(left.spanId).localeCompare(text(right.spanId))
  );
}
