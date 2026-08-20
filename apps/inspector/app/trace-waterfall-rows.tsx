"use client";

import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import { Button } from "../components/ui/button";
import type { WaterfallSpan } from "../lib/observability-model";

export function TraceWaterfallRows({
  items,
  parentIds,
  collapsed,
  zoom,
  onToggle,
  onSelect,
}: {
  readonly items: readonly WaterfallSpan[];
  readonly parentIds: ReadonlySet<string>;
  readonly collapsed: ReadonlySet<string>;
  readonly zoom: number;
  readonly onToggle: (id: string) => void;
  readonly onSelect: (span: WaterfallSpan) => void;
}) {
  return (
    <div className="trace-waterfall-scroll">
      <ol
        className="waterfall-list"
        aria-label="Accessible span waterfall"
        style={{ minWidth: `${zoom * 100}%` }}
      >
        {items.map((span) => (
          <li className="waterfall-row" data-error={span.error} key={span.spanId}>
            <div className="waterfall-label" style={{ paddingLeft: `${span.depth * 1.1}rem` }}>
              <span className="span-title">
                {parentIds.has(span.spanId) ? (
                  <button
                    type="button"
                    className="span-toggle"
                    aria-label={`${collapsed.has(span.spanId) ? "Expand" : "Collapse"} ${span.name}`}
                    aria-expanded={!collapsed.has(span.spanId)}
                    onClick={() => onToggle(span.spanId)}
                  >
                    {collapsed.has(span.spanId) ? (
                      <ChevronRight aria-hidden="true" />
                    ) : (
                      <ChevronDown aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="span-toggle" aria-hidden="true" />
                )}
                <strong>{bounded(span.name)}</strong>
              </span>
              <small>
                {span.kind} · {span.outcome || span.status || "recorded"} ·{" "}
                {duration(span.durationMs)}
              </small>
              {span.correlations.length > 0 && (
                <span className="span-correlations">
                  {span.correlations.map((link) => (
                    <a href={link.href} key={`${link.kind}:${link.id}`}>
                      {link.kind} {bounded(link.id)}
                    </a>
                  ))}
                </span>
              )}
            </div>
            <div
              className="waterfall-track"
              aria-label={`${span.name}, ${duration(span.durationMs)}`}
            >
              <span
                data-error={span.error}
                style={{ marginLeft: `${span.offsetPercent}%`, width: `${span.widthPercent}%` }}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Inspect ${span.name}`}
              onPress={() => onSelect(span)}
            >
              <Eye aria-hidden="true" className="size-4" />
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function bounded(value: string): string {
  return value.length <= 72 ? value : `${value.slice(0, 48)}…${value.slice(-16)}`;
}

function duration(value: number | undefined): string {
  return value === undefined ? "duration unavailable" : `${value.toLocaleString("en-US")} ms`;
}
