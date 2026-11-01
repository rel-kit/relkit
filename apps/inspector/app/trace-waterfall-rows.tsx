"use client";

import { ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";
import { formatDuration } from "../lib/format";
import { cn } from "../lib/utils";
import {
  barGeometry,
  rulerLabel,
  rulerTicks,
  type TraceClock,
  type TraceRow,
} from "../lib/trace-view";

/**
 * Tree waterfall: each row is a step (span or lifecycle event) with its nesting, its kind, its
 * duration and its place on the trace's own clock. Selecting a row shows its details beside it.
 */
export function TraceWaterfallRows({
  rows,
  clock,
  collapsed,
  selectedId,
  highlightedSpanId,
  onSelect,
  onToggle,
}: {
  readonly rows: readonly TraceRow[];
  readonly clock: TraceClock;
  readonly collapsed: ReadonlySet<string>;
  readonly selectedId: string | undefined;
  readonly highlightedSpanId?: string;
  readonly onSelect: (row: TraceRow) => void;
  readonly onToggle: (spanId: string) => void;
}) {
  const ticks = rulerTicks(clock.totalMs);
  const step = ticks.length > 1 ? ((ticks[1]! - ticks[0]!) / clock.totalMs) * 100 : 100;
  const grid = { backgroundSize: `${step}% 100%` };
  const move = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = rows.findIndex((row) => row.id === selectedId);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    const row = rows[next];
    if (!row) return;
    onSelect(row);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-row-id="${CSS.escape(row.id)}"]`)
      ?.focus();
  };
  return (
    <div className="trace-waterfall">
      <div className="trace-ruler" aria-hidden="true">
        <span className="trace-ruler-label">Step</span>
        <span className="trace-ruler-scale">
          {ticks.map((tick) => (
            <span key={tick} style={{ left: `${(tick / clock.totalMs) * 100}%` }}>
              {rulerLabel(tick)}
            </span>
          ))}
        </span>
      </div>
      <ol className="waterfall-list" aria-label="Ordered trace timeline" onKeyDown={move}>
        {rows.map((row) => {
          const { span, event } = row;
          const isSpan = row.type === "span";
          const geometry = barGeometry(row, clock);
          const open = isSpan && !collapsed.has(span.id);
          const running = isSpan && span.durationMs === undefined && !span.completedAt;
          return (
            <li
              key={row.id}
              className="waterfall-row"
              data-record-type={row.type}
              data-error={isSpan ? span.error : undefined}
              data-selected={row.id === selectedId}
              data-highlighted={isSpan && span.spanId === highlightedSpanId}
            >
              <div className="waterfall-step" style={{ paddingLeft: `${row.depth * 14}px` }}>
                <span className="waterfall-order">{row.order}</span>
                {isSpan && row.expandable ? (
                  <button
                    type="button"
                    className="waterfall-caret"
                    aria-label={`${open ? "Collapse" : "Expand"} ${span.name}`}
                    aria-expanded={open}
                    onClick={() => onToggle(span.id)}
                  >
                    <ChevronRight aria-hidden="true" className={cn(open && "rotate-90")} />
                  </button>
                ) : (
                  <span className="waterfall-caret" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="waterfall-select"
                  data-row-id={row.id}
                  aria-pressed={row.id === selectedId}
                  aria-label={isSpan ? `Inspect ${span.name}` : `Inspect event ${event?.name}`}
                  onClick={() => onSelect(row)}
                >
                  <span className="waterfall-kind" data-kind={isSpan ? "span" : "event"}>
                    {isSpan ? span.operationType : "event"}
                  </span>
                  <span className="waterfall-name" title={isSpan ? span.name : event?.name}>
                    {isSpan ? span.name : event?.name}
                  </span>
                </button>
                <span className="waterfall-time">
                  {isSpan
                    ? running
                      ? "running"
                      : formatDuration(span.durationMs)
                    : `+${formatDuration(row.offsetMs)}`}
                </span>
              </div>
              <div className="waterfall-track-cell" style={grid} aria-hidden="true">
                {isSpan ? (
                  <span
                    className="waterfall-bar"
                    data-running={running}
                    style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
                  >
                    {span.events.map((item, index) => (
                      <span
                        key={index}
                        className="waterfall-tick"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((offsetIn(item.timestamp, clock) - (row.offsetMs ?? 0)) / Math.max(span.durationMs ?? 1, 0.001)) * 100))}%`,
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="waterfall-point" style={{ left: `${geometry.left}%` }} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function offsetIn(timestamp: string, clock: TraceClock): number {
  const at = Date.parse(timestamp);
  return Number.isFinite(at) ? at - clock.origin : 0;
}
