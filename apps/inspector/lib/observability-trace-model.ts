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
  readonly offsetPercent: number;
  readonly widthPercent: number;
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
  const starts = valid.map((span) => Date.parse(text(span.startedAt))).filter(Number.isFinite);
  const origin = starts.length === 0 ? 0 : Math.min(...starts);
  const ends = valid.map((span) => {
    const start = Date.parse(text(span.startedAt));
    const duration = number(span.durationMs) ?? 0;
    return Number.isFinite(start) ? start + duration : origin + duration;
  });
  const total = Math.max(1, ...ends.map((end) => end - origin));
  const parents = new Map(valid.map((span) => [text(span.spanId), text(span.parentSpanId)]));
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const parent = parents.get(id);
    if (parent === undefined || parent === "" || seen.has(parent)) return 0;
    seen.add(parent);
    return Math.min(8, depthOf(parent, seen) + 1);
  };
  return valid.sort(byTime).map((span) => {
    const start = Date.parse(text(span.startedAt));
    const duration = Math.max(0, number(span.durationMs) ?? 0);
    const offset = Number.isFinite(start) ? ((start - origin) / total) * 100 : 0;
    return {
      spanId: text(span.spanId),
      name: text(span.name) || "span",
      ...(text(span.parentSpanId) ? { parentSpanId: text(span.parentSpanId) } : {}),
      depth: depthOf(text(span.spanId)),
      ...(text(span.startedAt) ? { startedAt: text(span.startedAt) } : {}),
      ...(text(span.completedAt) ? { completedAt: text(span.completedAt) } : {}),
      ...(number(span.durationMs) === undefined ? {} : { durationMs: duration }),
      ...(text(span.status) ? { status: text(span.status) } : {}),
      ...(text(span.outcome) ? { outcome: text(span.outcome) } : {}),
      offsetPercent: Math.max(0, Math.min(96, offset)),
      widthPercent: Math.max(4, Math.min(100 - Math.max(0, offset), (duration / total) * 100)),
    };
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
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
