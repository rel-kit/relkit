"use client";

import { useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Search, TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/neon/empty-state";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import { clockTime, formatDuration } from "../lib/format";
import { waterfall } from "../lib/observability-model";
import {
  lifecyclePhases,
  traceClock,
  traceRows,
  traceStepTotal,
  traceSummary,
  type TraceRow,
} from "../lib/trace-view";
import { cn } from "../lib/utils";
import { TraceWaterfallRows } from "./trace-waterfall-rows";
import { TraceStepDetails } from "./trace-waterfall-detail";
import "./traces/traces.css";

/*
 * Trace view: a summary of the whole request, its lifecycle in order, a tree waterfall on the
 * trace's own clock, and the selected step's full details beside it (stacked in narrow drawers).
 * Patterns adapted from Neon UI CheckpointTimeline (MIT; see public/THIRD_PARTY_NOTICES.txt).
 */
export function TraceWaterfall({
  spans,
  requests,
  compact = false,
  highlightedSpanId,
}: {
  readonly spans: readonly InspectorObject[];
  readonly requests?: readonly InspectorObject[];
  readonly compact?: boolean;
  readonly highlightedSpanId?: string;
}) {
  const items = useMemo(() => waterfall(spans, requests), [spans, requests]);
  const clock = useMemo(() => traceClock(items), [items]);
  const summary = useMemo(() => traceSummary(items), [items]);
  const phases = useMemo(() => lifecyclePhases(items), [items]);
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string>();
  const allRows = useMemo(() => traceRows(items, collapsed), [items, collapsed]);
  const rows = useMemo(
    () => allRows.filter((row) => matches(row, query, errorsOnly)),
    [allRows, errorsOnly, query],
  );
  const highlighted = items.find((item) => item.spanId === highlightedSpanId)?.id;
  const fallbackId = highlighted ?? summary.root?.id;
  const selected =
    rows.find((row) => row.id === selectedId) ??
    traceRows(items).find((row) => row.id === (selectedId ?? fallbackId)) ??
    rows[0];
  const expandable = useMemo(
    () => new Set(traceRows(items).flatMap((row) => (row.expandable ? [row.span.id] : []))),
    [items],
  );
  const total = traceStepTotal(items);
  const select = (row: TraceRow) => setSelectedId(row.id);
  const selectId = (id: string) => {
    setSelectedId(id);
    // Selecting a step hidden under a collapsed parent opens the path to it.
    const parents = new Map(items.map((item) => [item.id, item.parentId]));
    const spanId = id.split(":event:")[0]!;
    setCollapsed((current) => {
      const next = new Set(current);
      let parent = id.includes(":event:") ? spanId : parents.get(spanId);
      while (parent) {
        next.delete(parent);
        parent = parents.get(parent);
      }
      return next;
    });
  };
  const toggle = (spanId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });

  return (
    <section
      className={cn("trace-panel trace-view", compact && "trace-compact")}
      aria-labelledby={compact ? undefined : "trace-waterfall-heading"}
      aria-label={compact ? "Trace" : undefined}
    >
      {!compact && (
        <header className="trace-view-header">
          <h2 id="trace-waterfall-heading">
            {requests?.length ? "Request timeline" : "Trace timeline"}
          </h2>
          <p>Numbered by recorded time. Events branch from operations.</p>
        </header>
      )}

      {summary.root ? (
        <div className="trace-summary">
          <StatusBadge
            tone={
              summary.running
                ? "live"
                : summary.errors > 0
                  ? "danger"
                  : statusTone(summary.root.outcome || summary.root.status || "success")
            }
            label={
              summary.running
                ? "running"
                : summary.root.outcome || summary.root.status || "recorded"
            }
          />
          <strong className="trace-summary-name" title={summary.root.name}>
            {summary.root.name}
          </strong>
          <span className="trace-summary-facts">
            {summary.root.status && summary.root.outcome ? (
              <span>{summary.root.status}</span>
            ) : null}
            <span>{summary.running ? "in progress" : formatDuration(summary.totalMs)}</span>
            {summary.startedAt ? <span>started {clockTime(summary.startedAt)}</span> : null}
            <span>
              {summary.spans} span{summary.spans === 1 ? "" : "s"}
            </span>
            <span>
              {summary.events} event{summary.events === 1 ? "" : "s"}
            </span>
            <span className={summary.errors > 0 ? "text-danger" : undefined}>
              {summary.errors} error{summary.errors === 1 ? "" : "s"}
            </span>
          </span>
        </div>
      ) : null}

      {phases.length > 0 ? (
        <nav className="trace-lifecycle" aria-label="Lifecycle">
          <ol>
            {phases.map((phase) => (
              <li key={phase.id} data-type={phase.type} data-error={phase.error}>
                <button
                  type="button"
                  aria-pressed={selected?.id === phase.id}
                  onClick={() => selectId(phase.id)}
                  title={phase.label}
                >
                  <span className="trace-lifecycle-marker" aria-hidden="true" />
                  <span className="trace-lifecycle-label">{phase.label}</span>
                  <span className="trace-lifecycle-time">
                    +{formatDuration(phase.offsetMs)}
                    {phase.durationMs !== undefined ? ` · ${formatDuration(phase.durationMs)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="trace-toolbar" role="group" aria-label="Trace filters">
        <label className="trace-search">
          <span className="sr-only">Search steps</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search steps, events, IDs or status"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <Button
          variant={errorsOnly ? "default" : "secondary"}
          size="sm"
          aria-pressed={errorsOnly}
          isDisabled={summary.errors === 0 && !errorsOnly}
          onPress={() => setErrorsOnly((value) => !value)}
        >
          <TriangleAlert aria-hidden="true" />
          <span className={compact ? "sr-only" : undefined}>Errors only</span>
          {summary.errors > 0 ? (
            <span className="font-mono tabular-nums">{summary.errors}</span>
          ) : null}
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setCollapsed(new Set())}>
          <ChevronsUpDown aria-hidden="true" />
          <span className={compact ? "sr-only" : undefined}>Expand all</span>
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setCollapsed(new Set(expandable))}>
          <ChevronsDownUp aria-hidden="true" />
          <span className={compact ? "sr-only" : undefined}>Collapse all</span>
        </Button>
        <span className="trace-step-count">
          {rows.length} of {total} steps
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState size="sm" variant="bare" title="No steps are retained for this trace." />
      ) : (
        <div className="trace-body">
          {rows.length === 0 ? (
            <EmptyState size="sm" variant="bare" title="No steps match the active filters." />
          ) : (
            <TraceWaterfallRows
              rows={rows}
              clock={clock}
              collapsed={collapsed}
              selectedId={selected?.id}
              onSelect={select}
              onToggle={toggle}
              {...(highlightedSpanId ? { highlightedSpanId } : {})}
            />
          )}
          <TraceStepDetails row={selected} clock={clock} onSelectSpan={selectId} />
        </div>
      )}
    </section>
  );
}

function matches(row: TraceRow, query: string, errorsOnly: boolean): boolean {
  if (errorsOnly && !row.span.error) return false;
  const value = query.trim().toLowerCase();
  if (value === "") return true;
  const { span, event } = row;
  return `${event?.name ?? ""} ${span.name} ${span.spanId} ${span.kind} ${span.operationType} ${span.status ?? ""} ${span.outcome ?? ""}`
    .toLowerCase()
    .includes(value);
}
