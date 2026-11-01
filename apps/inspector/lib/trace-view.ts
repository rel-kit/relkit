/**
 * Pure layout for the trace view: tree-ordered rows (spans with their events and child spans
 * interleaved by time), the trace clock, the request lifecycle strip and the time ruler.
 */
import type { WaterfallEvent, WaterfallSpan } from "./observability-trace-model";

export interface TraceRow {
  /** Span id, or `<spanId>:event:<index>` for an event. */
  readonly id: string;
  readonly type: "span" | "event";
  readonly span: WaterfallSpan;
  readonly event?: WaterfallEvent;
  readonly depth: number;
  /** 1-based position in the full (uncollapsed) trace. */
  readonly order: number;
  /** Milliseconds from the trace start; undefined when the record has no usable time. */
  readonly offsetMs?: number;
  /** Spans only: whether collapsing would hide anything. */
  readonly expandable: boolean;
}

export interface TraceClock {
  /** Epoch milliseconds of the earliest recorded start. */
  readonly origin: number;
  /** Total trace length in milliseconds (at least 1 so bars stay drawable). */
  readonly totalMs: number;
}

export function traceClock(items: readonly WaterfallSpan[]): TraceClock {
  let origin = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const span of items) {
    const start = time(span.startedAt);
    if (start === undefined) continue;
    origin = Math.min(origin, start);
    end = Math.max(end, start + (span.durationMs ?? 0), time(span.completedAt) ?? start);
    for (const event of span.events) end = Math.max(end, time(event.timestamp) ?? start);
  }
  if (!Number.isFinite(origin)) return { origin: 0, totalMs: 1 };
  return { origin, totalMs: Math.max(1, end - origin) };
}

/**
 * Depth-first rows: each span is followed by its own events and child spans in recorded-time
 * order. A collapsed span keeps its row and hides everything beneath it.
 */
export function traceRows(
  items: readonly WaterfallSpan[],
  collapsed: ReadonlySet<string> = new Set(),
): readonly TraceRow[] {
  const clock = traceClock(items);
  const ids = new Set(items.map((item) => item.id));
  const children = new Map<string | undefined, WaterfallSpan[]>();
  for (const span of items) {
    const parent = span.parentId && ids.has(span.parentId) ? span.parentId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), span]);
  }
  const rows: TraceRow[] = [];
  const visited = new Set<string>();
  let order = 0;
  const visit = (span: WaterfallSpan, depth: number, hidden: boolean): void => {
    if (visited.has(span.id)) return;
    visited.add(span.id);
    order += 1;
    const kids = children.get(span.id) ?? [];
    if (!hidden)
      rows.push({
        id: span.id,
        type: "span",
        span,
        depth,
        order,
        ...offset(span.startedAt, clock),
        expandable: kids.length > 0 || span.events.length > 0,
      });
    const hideBelow = hidden || collapsed.has(span.id);
    const entries = [
      ...span.events.map((event, index) => ({
        at: time(event.timestamp),
        sequence: index,
        run: () => {
          order += 1;
          if (!hideBelow)
            rows.push({
              id: `${span.id}:event:${index}`,
              type: "event",
              span,
              event,
              depth: depth + 1,
              order,
              ...offset(event.timestamp, clock),
              expandable: false,
            });
        },
      })),
      ...kids.map((child, index) => ({
        at: time(child.startedAt),
        sequence: span.events.length + index,
        run: () => visit(child, depth + 1, hideBelow),
      })),
    ].sort(
      (left, right) =>
        (left.at ?? Number.MAX_SAFE_INTEGER) - (right.at ?? Number.MAX_SAFE_INTEGER) ||
        left.sequence - right.sequence,
    );
    for (const entry of entries) entry.run();
  };
  for (const root of sortByStart(children.get(undefined) ?? [])) visit(root, 0, false);
  // Spans whose parents form a cycle (or point at themselves) are reachable from no root; they
  // still get rows so the view never shows fewer steps than `traceStepTotal` counts.
  for (const span of sortByStart(items)) visit(span, 0, false);
  return rows;
}

/** Spans plus events: the step total shown as "N of M steps". */
export function traceStepTotal(items: readonly WaterfallSpan[]): number {
  return items.reduce((total, span) => total + 1 + span.events.length, 0);
}

export interface TraceSummary {
  readonly root?: WaterfallSpan;
  readonly totalMs: number;
  readonly startedAt?: string;
  readonly spans: number;
  readonly events: number;
  readonly errors: number;
  readonly running: boolean;
}

export function traceSummary(items: readonly WaterfallSpan[]): TraceSummary {
  const ids = new Set(items.map((item) => item.id));
  const root = sortByStart(items.filter((item) => !item.parentId || !ids.has(item.parentId)))[0];
  const clock = traceClock(items);
  return {
    ...(root ? { root } : {}),
    totalMs: root?.durationMs ?? clock.totalMs,
    ...(root?.startedAt ? { startedAt: root.startedAt } : {}),
    spans: items.length,
    events: items.reduce((total, span) => total + span.events.length, 0),
    errors: items.filter((item) => item.error).length,
    running: items.some((item) => item.durationMs === undefined && !item.completedAt),
  };
}

export interface LifecyclePhase {
  /** Row id to select when the phase is chosen. */
  readonly id: string;
  readonly label: string;
  readonly type: "span" | "event";
  readonly offsetMs?: number;
  readonly durationMs?: number;
  readonly error: boolean;
}

/**
 * The root operation's story in recorded-time order: its own lifecycle events and the
 * operations it called, each with time from the start of the trace.
 */
export function lifecyclePhases(items: readonly WaterfallSpan[]): readonly LifecyclePhase[] {
  const { root } = traceSummary(items);
  if (!root) return [];
  // The root's own events plus every operation at the top two levels: some producers record the
  // handler as a sibling of the transport span rather than as its child.
  const rows = traceRows(items)
    .filter((row) =>
      row.type === "event" ? row.span.id === root.id : row.span.id !== root.id && row.depth <= 1,
    )
    .sort(
      (left, right) =>
        (left.offsetMs ?? Number.MAX_SAFE_INTEGER) - (right.offsetMs ?? Number.MAX_SAFE_INTEGER) ||
        left.order - right.order,
    );
  return rows.map((row) => ({
    id: row.id,
    label: row.event ? shortEventName(row.event.name) : row.span.name,
    type: row.type,
    ...(row.offsetMs === undefined ? {} : { offsetMs: row.offsetMs }),
    ...(row.type === "span" && row.span.durationMs !== undefined
      ? { durationMs: row.span.durationMs }
      : {}),
    error:
      row.type === "span"
        ? row.span.error
        : /error|fail|timeout|cancel|defect/i.test(row.event?.name ?? ""),
  }));
}

/** "http.request.received" → "request received": the protocol prefix adds no information. */
export function shortEventName(name: string): string {
  return name.replace(/^(http|relkit)\./, "").replace(/[._-]+/g, " ");
}

/** Evenly spaced ruler marks on round values, always including 0 and never past the end. */
export function rulerTicks(totalMs: number, target = 4): readonly number[] {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return [0];
  const raw = totalMs / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= raw) ??
    10 * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value <= totalMs + step * 1e-9; value += step)
    ticks.push(Math.round(value * 1000) / 1000);
  return ticks;
}

/** Bar geometry in percent of the trace for a span, or a point for an event. */
export function barGeometry(
  row: TraceRow,
  clock: TraceClock,
): { readonly left: number; readonly width: number } {
  const left = clamp(((row.offsetMs ?? 0) / clock.totalMs) * 100);
  if (row.type === "event") return { left, width: 0 };
  const duration = row.span.durationMs ?? Math.max(0, clock.totalMs - (row.offsetMs ?? 0));
  return { left, width: Math.max(0.4, Math.min(100 - left, (duration / clock.totalMs) * 100)) };
}

function offset(value: string | undefined, clock: TraceClock): { offsetMs?: number } {
  const at = time(value);
  return at === undefined ? {} : { offsetMs: Math.max(0, at - clock.origin) };
}

function sortByStart(items: readonly WaterfallSpan[]): WaterfallSpan[] {
  return [...items].sort(
    (left, right) =>
      (time(left.startedAt) ?? Number.MAX_SAFE_INTEGER) -
      (time(right.startedAt) ?? Number.MAX_SAFE_INTEGER),
  );
}

function time(value: string | undefined): number | undefined {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** Compact ruler label: "0", "250ms", "1.5s". */
export function rulerLabel(ms: number): string {
  if (ms === 0) return "0";
  if (ms >= 1000) return `${Number((ms / 1000).toFixed(2))}s`;
  return `${Number(ms.toFixed(ms < 10 ? 1 : 0))}ms`;
}
