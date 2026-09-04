import type { InspectorObject } from "./api-types";
import type { WaterfallEvent, WaterfallSpan } from "./observability-model";
import { eventData } from "./trace-io";

export interface TraceTimelineStep {
  readonly id: string;
  readonly order: number;
  readonly type: "span" | "event";
  readonly name: string;
  readonly timestamp?: string;
  readonly span: WaterfallSpan;
  readonly event?: WaterfallEvent;
}

export function traceTimeline(
  items: readonly WaterfallSpan[],
  collapsed: ReadonlySet<string> = new Set(),
): readonly TraceTimelineStep[] {
  const steps = items.flatMap((span, spanIndex): TraceTimelineStep[] => [
    {
      id: span.id,
      order: spanIndex * 100,
      type: "span",
      name: span.name,
      timestamp: span.startedAt,
      span,
    },
    ...(collapsed.has(span.id)
      ? []
      : span.events.map((event, eventIndex) => ({
          id: `${span.id}:event:${eventIndex}`,
          order: spanIndex * 100 + eventIndex + 1,
          type: "event" as const,
          name: event.name,
          timestamp: event.timestamp,
          span,
          event,
        }))),
  ]);
  return steps.sort(
    (left, right) =>
      timestampValue(left.timestamp) - timestampValue(right.timestamp) || left.order - right.order,
  );
}

export function visibleTraceStepCount(
  items: readonly WaterfallSpan[],
  collapsed: ReadonlySet<string> = new Set(),
): number {
  return traceTimeline(items, collapsed).length;
}

export function stepInput(step: TraceTimelineStep): unknown {
  return step.event ? eventData(step.event.attributes) : step.span.details.input;
}

export function stepOutput(step: TraceTimelineStep): unknown {
  return !step.event || isTerminalHttpEvent(step.event.name) ? step.span.details.output : undefined;
}

export function stepOutcome(step: TraceTimelineStep): InspectorObject {
  if (step.event)
    return step.event.droppedAttributes
      ? { status: "recorded", droppedAttributes: step.event.droppedAttributes }
      : { status: "recorded" };
  const { span } = step;
  return {
    ...(span.outcome ? { outcome: span.outcome } : {}),
    ...(span.status ? { status: span.status } : {}),
    ...(span.durationMs === undefined ? {} : { duration: duration(span.durationMs) }),
  };
}

export function stepDescription(step: TraceTimelineStep): string {
  if (step.event) return step.span.name;
  const span = step.span;
  return `${span.outcome || span.status || "recorded"}${span.name.startsWith("relkit.middleware.") ? " · inclusive duration" : ""} · ${duration(span.durationMs)}`;
}

export function stepType(step: TraceTimelineStep): string {
  return step.event ? "lifecycle event" : step.span.operationType;
}

export function formatTraceTimestamp(value: string | undefined): string {
  const parsed = timestampValue(value);
  return parsed === Number.MAX_SAFE_INTEGER
    ? "Time unavailable"
    : new Date(parsed).toISOString().replace("T", " ").replace("Z", " UTC");
}

function timestampValue(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function duration(value: number | undefined): string {
  return value === undefined ? "duration unavailable" : `${value.toLocaleString("en-US")} ms`;
}

function isTerminalHttpEvent(name: string): boolean {
  return /^http\.(?:success|declared-error|validation-error|timeout|cancelled|defect)$/.test(name);
}
