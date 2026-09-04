"use client";

import { Eye } from "lucide-react";
import { Button } from "../components/ui/button";
import type { WaterfallSpan } from "../lib/observability-model";
import {
  formatTraceTimestamp,
  stepDescription,
  stepInput,
  stepOutput,
  stepType,
  traceTimeline,
} from "../lib/trace-timeline";

export function TraceWaterfallRows({
  items,
  collapsed,
  onSelect,
  highlightedSpanId,
}: {
  readonly items: readonly WaterfallSpan[];
  readonly collapsed: ReadonlySet<string>;
  readonly highlightedSpanId?: string;
  readonly onSelect: (span: WaterfallSpan) => void;
}) {
  const steps = traceTimeline(items, collapsed);
  return (
    <div className="trace-waterfall-scroll">
      <ol className="waterfall-list" aria-label="Ordered trace timeline">
        {steps.map((step, index) => {
          const { span } = step;
          const event = step.event;
          const isSpan = step.type === "span";
          const input = valuePreview(stepInput(step));
          const output = valuePreview(stepOutput(step));
          return (
            <li
              className="waterfall-row"
              data-error={isSpan && span.error}
              data-highlighted={span.spanId === highlightedSpanId}
              key={step.id}
              data-record-type={step.type}
            >
              <div
                className="timeline-sequence"
                data-branch={event ? "true" : "false"}
                aria-label={`Step ${index + 1}`}
              >
                <strong>{index + 1}</strong>
              </div>
              <div className="waterfall-main">
                <div className="waterfall-label">
                  <span className="span-title">
                    <span className="trace-step-type">{stepType(step)}</span>
                    <strong title={step.name}>{bounded(step.name)}</strong>
                  </span>
                </div>
                <div className="trace-step-meta">
                  <time dateTime={step.timestamp}>{formatTraceTimestamp(step.timestamp)}</time>
                  <small>{stepDescription(step)}</small>
                </div>
                {input && (
                  <span className="trace-step-io">
                    <b>Input</b>
                    <code title={input}>{input}</code>
                  </span>
                )}
                {output && (
                  <span className="trace-step-io">
                    <b>Output</b>
                    <code title={output}>{output}</code>
                  </span>
                )}
              </div>
              {isSpan ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Inspect ${span.name}`}
                  onPress={() => onSelect(span)}
                >
                  <Eye aria-hidden="true" className="size-4" />
                </Button>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function valuePreview(value: unknown): string {
  if (value === undefined) return "";
  if (Array.isArray(value) && value.length === 0) return "";
  if (value !== null && typeof value === "object" && Object.keys(value).length === 0) return "";
  return JSON.stringify(value) ?? String(value);
}

function bounded(value: string): string {
  return value.length <= 72 ? value : `${value.slice(0, 48)}…${value.slice(-16)}`;
}
