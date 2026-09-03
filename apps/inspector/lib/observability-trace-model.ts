import type { InspectorObject } from "./api-types";
import { orderTraceNodes, traceDuration, traceLifecycle } from "./trace-lifecycle";

export interface WaterfallSpan {
  readonly id: string;
  readonly parentId?: string;
  readonly recordType: string;
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

export function waterfall(
  spans: readonly InspectorObject[],
  requests: readonly InspectorObject[] = [],
): readonly WaterfallSpan[] {
  const valid = traceLifecycle(spans, requests);
  let origin = Number.POSITIVE_INFINITY;
  for (const span of valid) {
    const start = Date.parse(text(span.startedAt));
    if (Number.isFinite(start)) origin = Math.min(origin, start);
  }
  if (!Number.isFinite(origin)) origin = 0;
  let total = 1;
  for (const span of valid) {
    const start = Date.parse(text(span.startedAt));
    const end = (Number.isFinite(start) ? start : origin) + (traceDuration(span) ?? 0);
    total = Math.max(total, end - origin);
  }
  return orderTraceNodes(valid).map((span) => {
    const start = Date.parse(text(span.startedAt));
    const duration = traceDuration(span);
    const offset = Number.isFinite(start) ? ((start - origin) / total) * 100 : 0;
    const status = typeof span.status === "number" ? `HTTP ${span.status}` : text(span.status);
    const outcome = text(span.outcome);
    return {
      id: text(span.nodeId),
      ...(text(span.nodeParentId) ? { parentId: text(span.nodeParentId) } : {}),
      recordType: text(span.recordType),
      spanId: text(span.spanId),
      name: text(span.name) || "span",
      ...(text(span.parentSpanId) ? { parentSpanId: text(span.parentSpanId) } : {}),
      depth: number(span.depth) ?? 0,
      ...(text(span.startedAt) ? { startedAt: text(span.startedAt) } : {}),
      ...(text(span.completedAt) ? { completedAt: text(span.completedAt) } : {}),
      ...(duration === undefined ? {} : { durationMs: duration }),
      ...(status ? { status } : {}),
      ...(outcome ? { outcome } : {}),
      kind: spanKind(span),
      error: /error|fail|defect|timeout|cancelled|HTTP [45]/i.test(`${status} ${outcome}`),
      details: safeDetails(span),
      correlations: correlations(span),
      offsetPercent: Math.max(0, Math.min(100, offset)),
      widthPercent: Math.max(
        0,
        Math.min(100 - Math.max(0, offset), ((duration ?? 0) / total) * 100),
      ),
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

export { traceGroups, type TraceGroup } from "./trace-groups";
