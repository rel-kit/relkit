import type { InspectorObject } from "./api-types";
import { traceDuration, traceLifecycle } from "./trace-lifecycle";

export interface TraceGroup {
  readonly traceId: string;
  readonly name: string;
  readonly trace?: InspectorObject;
  readonly spans: readonly InspectorObject[];
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly outcome?: string;
}

export function traceGroups(items: readonly InspectorObject[]): readonly TraceGroup[] {
  const groups = new Map<
    string,
    { trace?: InspectorObject; request?: InspectorObject; spans: InspectorObject[] }
  >();
  for (const item of items) {
    const traceId = text(item.traceId);
    if (traceId === "") continue;
    const group = groups.get(traceId) ?? { spans: [] };
    if (item.signal === "trace") group.trace = item;
    if (item.signal === "request") group.request = item;
    if (item.signal === "span" || text(item.spanId) !== "") group.spans.push(item);
    groups.set(traceId, group);
  }
  return [...groups.entries()]
    .map(([traceId, group]) => {
      const trace = group.trace;
      const summary = group.request ?? trace;
      const spans = [...traceLifecycle(group.spans)].sort(byTime);
      const root = spans.find((span) => !span.parentSpanId) ?? spans[0];
      const startedAt = text(summary?.startedAt) || text(spans[0]?.startedAt);
      const completedAt =
        text(summary?.completedAt) ||
        spans
          .map((span) => text(span.completedAt))
          .sort()
          .at(-1) ||
        "";
      const durationMs = summary
        ? traceDuration(summary)
        : traceDuration({ startedAt, completedAt });
      const outcome = text(summary?.outcome) || text(root?.outcome) || text(root?.status);
      return {
        traceId,
        name: group.request
          ? `${text(group.request.method)} ${text(group.request.rawPath)}`
          : text(trace?.name) || text(root?.name) || traceId,
        ...(trace === undefined ? {} : { trace }),
        spans,
        ...(startedAt === "" ? {} : { startedAt }),
        ...(completedAt === "" ? {} : { completedAt }),
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(outcome === "" ? {} : { outcome }),
      };
    })
    .sort(
      (left, right) =>
        (Date.parse(right.startedAt ?? "") || 0) - (Date.parse(left.startedAt ?? "") || 0) ||
        left.traceId.localeCompare(right.traceId),
    );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function byTime(left: InspectorObject, right: InspectorObject): number {
  return (
    (Date.parse(text(left.startedAt) || text(left.timestamp) || text(left.occurredAt)) || 0) -
      (Date.parse(text(right.startedAt) || text(right.timestamp) || text(right.occurredAt)) || 0) ||
    text(left.spanId).localeCompare(text(right.spanId))
  );
}
