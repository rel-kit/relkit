"use client";

import { ArrowUpRight, CornerLeftUp } from "lucide-react";
import type { ReactNode } from "react";
import { CodeBlock } from "../components/blocks/code-block";
import { CopyButton } from "../components/blocks/copy-button";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { formatDuration } from "../lib/format";
import type { WaterfallSpan } from "../lib/observability-model";
import { formatTraceTimestamp } from "../lib/trace-timeline";
import { shortEventName, type TraceClock, type TraceRow } from "../lib/trace-view";
import { eventData } from "../lib/trace-io";
import { cn } from "../lib/utils";
import { SourceLink } from "./source-link";

/**
 * Everything RELKIT retained for one step, laid out top to bottom: identity, timing on the trace
 * clock, input and output, failure, events, attributes, correlations and logs. Nothing is behind
 * tabs; empty sections say why they are empty.
 */
export function TraceStepDetails({
  row,
  clock,
  onSelectSpan,
}: {
  readonly row: TraceRow | undefined;
  readonly clock: TraceClock;
  readonly onSelectSpan: (spanId: string) => void;
}) {
  if (!row)
    return (
      <aside className="trace-details" aria-label="Step details">
        <p className="trace-details-empty">Select a step to see its details.</p>
      </aside>
    );
  return (
    <aside className="trace-details" aria-label="Step details">
      {row.event ? (
        <EventDetails row={row} clock={clock} onSelectSpan={onSelectSpan} />
      ) : (
        <SpanDetails span={row.span} row={row} clock={clock} />
      )}
    </aside>
  );
}

function SpanDetails({
  span,
  row,
  clock,
}: {
  readonly span: WaterfallSpan;
  readonly row: TraceRow;
  readonly clock: TraceClock;
}) {
  const details = span.details;
  const status = span.outcome || span.status || (span.completedAt ? "recorded" : "running");
  const start = row.offsetMs ?? 0;
  const end = span.durationMs === undefined ? undefined : start + span.durationMs;
  return (
    <>
      <header className="trace-details-header">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="waterfall-kind" data-kind="span">
            {span.operationType}
          </span>
          <StatusBadge tone={span.error ? "danger" : statusTone(status)} label={status} />
          {span.status && span.outcome ? (
            <span className="font-mono text-[11px] text-muted-foreground">{span.status}</span>
          ) : null}
        </div>
        <h3 className="trace-details-title" title={span.name}>
          {span.name}
        </h3>
        {span.name.startsWith("relkit.middleware.") ? (
          <p className="text-xs text-muted-foreground">
            Middleware durations include the work they wrap.
          </p>
        ) : null}
      </header>

      <TimingBlock
        startMs={start}
        durationMs={span.durationMs}
        endMs={end}
        clock={clock}
        startedAt={span.startedAt}
        completedAt={span.completedAt}
      />

      <Block title="Input">
        <Value
          value={details.input}
          empty={captureEmpty("Input", details.inputCapture)}
          label="input"
        />
      </Block>
      <Block title="Output">
        <Value
          value={details.output}
          empty={
            span.completedAt || span.durationMs !== undefined
              ? captureEmpty("Output", details.outputCapture)
              : "This step is still running; output appears when it completes."
          }
          label="output"
        />
      </Block>
      {!isEmpty(details.error) ? (
        <Block title="Error" tone="danger">
          <Value value={details.error} empty="" label="error" />
        </Block>
      ) : null}

      <Block title="Events" count={span.events.length}>
        {span.events.length === 0 ? (
          <Empty>No lifecycle events were recorded on this step.</Empty>
        ) : (
          <ol className="trace-event-list">
            {span.events.map((event, index) => {
              const at = Date.parse(event.timestamp);
              const fromStart = Number.isFinite(at) ? at - clock.origin - start : undefined;
              const data = eventData(event.attributes);
              return (
                <li key={`${event.name}:${index}`}>
                  <div className="trace-event-head">
                    <span className="waterfall-point-marker" aria-hidden="true" />
                    <span className="font-mono text-xs text-foreground">{event.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                      +{formatDuration(fromStart)}
                    </span>
                  </div>
                  {!isEmpty(data) ? <KeyValues value={data} /> : null}
                </li>
              );
            })}
          </ol>
        )}
      </Block>

      <Block title="Attributes">
        <KeyValues value={details.metadata} empty="No attributes were retained." />
        {hasDropped(details.dropped) ? (
          <div className="mt-2 grid gap-1">
            <p className="text-[11px] text-warning">Some attributes were dropped by limits:</p>
            <CodeBlock value={details.dropped} label="dropped counts" maxHeight="8rem" />
          </div>
        ) : null}
      </Block>

      {span.correlations.length > 0 ? (
        <Block title="Related">
          <ul className="trace-related">
            {span.correlations.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <a href={item.href}>
                  <span className="capitalize text-muted-foreground">{item.kind}</span>
                  <span className="truncate font-mono">{item.id}</span>
                  <ArrowUpRight aria-hidden="true" className="ml-auto size-3" />
                </a>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {!isEmpty(details.logs) ? (
        <Block title="Logs">
          <Value value={details.logs} empty="" label="logs" />
        </Block>
      ) : null}
      {Array.isArray(details.links) && details.links.length > 0 ? (
        <Block title="Linked traces">
          <LinksDetail value={details.links} />
        </Block>
      ) : null}

      <Block title="Identity">
        <dl className="trace-kv">
          <Fact label="Trace ID" value={span.traceId} copy />
          <Fact
            label={span.recordType === "span" ? "Span ID" : "Record"}
            value={span.spanId || span.recordType}
            copy={!!span.spanId}
          />
          <Fact label="Parent" value={span.parentSpanId ?? "Root"} />
          <Fact label="Kind" value={span.kind} />
          <div>
            <dt>Source</dt>
            <dd>
              <SourceLink source={details.source} />
            </dd>
          </div>
        </dl>
      </Block>
      {!isEmpty(details.resourceAttributes) ? (
        <details className="trace-resource">
          <summary>Resource attributes</summary>
          <KeyValues value={details.resourceAttributes} />
        </details>
      ) : null}
    </>
  );
}

function EventDetails({
  row,
  clock,
  onSelectSpan,
}: {
  readonly row: TraceRow;
  readonly clock: TraceClock;
  readonly onSelectSpan: (spanId: string) => void;
}) {
  const event = row.event!;
  const spanStart = Date.parse(row.span.startedAt ?? "");
  const at = Date.parse(event.timestamp);
  const fromSpan = Number.isFinite(spanStart) && Number.isFinite(at) ? at - spanStart : undefined;
  const data = eventData(event.attributes);
  return (
    <>
      <header className="trace-details-header">
        <div className="flex items-center gap-2">
          <span className="waterfall-kind" data-kind="event">
            event
          </span>
          <span className="text-xs text-muted-foreground">{shortEventName(event.name)}</span>
        </div>
        <h3 className="trace-details-title" title={event.name}>
          {event.name}
        </h3>
        <button
          type="button"
          className="trace-parent-link"
          onClick={() => onSelectSpan(row.span.id)}
        >
          <CornerLeftUp aria-hidden="true" className="size-3" /> Part of{" "}
          <span className="font-mono">{row.span.name}</span>
        </button>
      </header>
      <dl className="trace-timing">
        <Stat label="At" value={`+${formatDuration(row.offsetMs)}`} hint="from trace start" />
        <Stat label="Into step" value={`+${formatDuration(fromSpan)}`} hint={row.span.name} />
        <Stat
          label="Of trace"
          value={`${Math.round(((row.offsetMs ?? 0) / clock.totalMs) * 100)}%`}
          hint="elapsed"
        />
      </dl>
      <p className="trace-timestamps">{formatTraceTimestamp(event.timestamp)}</p>
      <Block title="Attributes">
        <KeyValues value={data} empty="This event carries no attributes." />
        {event.droppedAttributes ? (
          <p className="mt-2 text-[11px] text-warning">
            {event.droppedAttributes} attribute{event.droppedAttributes === 1 ? " was" : "s were"}{" "}
            dropped by limits.
          </p>
        ) : null}
      </Block>
    </>
  );
}

function TimingBlock({
  startMs,
  durationMs,
  endMs,
  clock,
  startedAt,
  completedAt,
}: {
  readonly startMs: number;
  readonly durationMs: number | undefined;
  readonly endMs: number | undefined;
  readonly clock: TraceClock;
  readonly startedAt: string | undefined;
  readonly completedAt: string | undefined;
}) {
  const left = Math.min(100, (startMs / clock.totalMs) * 100);
  const width =
    durationMs === undefined
      ? 100 - left
      : Math.max(0.6, Math.min(100 - left, (durationMs / clock.totalMs) * 100));
  return (
    <section className="trace-timing-block" aria-label="Timing">
      <dl className="trace-timing">
        <Stat label="Starts" value={`+${formatDuration(startMs)}`} hint="from trace start" />
        <Stat
          label="Duration"
          value={durationMs === undefined ? "running" : formatDuration(durationMs)}
          hint={
            durationMs === undefined
              ? "not finished"
              : `${Math.round((durationMs / clock.totalMs) * 100)}% of trace`
          }
        />
        <Stat
          label="Ends"
          value={endMs === undefined ? "—" : `+${formatDuration(endMs)}`}
          hint={`of ${formatDuration(clock.totalMs)}`}
        />
      </dl>
      <div className="trace-timing-bar" aria-hidden="true">
        <span style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <p className="trace-timestamps">
        {formatTraceTimestamp(startedAt)} →{" "}
        {completedAt ? formatTraceTimestamp(completedAt) : "in progress"}
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className="trace-stat-value">{value}</span>
        <span className="trace-stat-hint" title={hint}>
          {hint}
        </span>
      </dd>
    </div>
  );
}

function Block({
  title,
  count,
  tone,
  children,
}: {
  readonly title: string;
  readonly count?: number;
  readonly tone?: "danger";
  readonly children: ReactNode;
}) {
  return (
    <section className={cn("trace-block", tone === "danger" && "trace-block-danger")}>
      <h4>
        {title}
        {count !== undefined ? <span>{count}</span> : null}
      </h4>
      {children}
    </section>
  );
}

function Fact({
  label,
  value,
  copy = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly copy?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className="truncate font-mono" title={value}>
          {value || "—"}
        </span>
        {copy && value ? <CopyButton value={value} label={`Copy ${label}`} /> : null}
      </dd>
    </div>
  );
}

/** Flat objects read best as a key/value table; nested values fall back to formatted JSON. */
function KeyValues({
  value,
  empty = "No retained data.",
}: {
  readonly value: unknown;
  readonly empty?: string;
}) {
  if (isEmpty(value)) return <Empty>{empty}</Empty>;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return <CodeBlock value={value} label="value" maxHeight="16rem" />;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <dl className="trace-kv">
      {entries.map(([key, item]) => (
        <div key={key}>
          <dt title={key}>{key}</dt>
          <dd>
            {item !== null && typeof item === "object" ? (
              <code className="trace-kv-json">{JSON.stringify(item, null, 2)}</code>
            ) : (
              <span className="font-mono" title={String(item)}>
                {String(item)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Value({
  value,
  empty,
  label,
}: {
  readonly value: unknown;
  readonly empty: string;
  readonly label: string;
}) {
  return isEmpty(value) ? (
    <Empty>{empty}</Empty>
  ) : (
    <CodeBlock value={value} label={label} maxHeight="22rem" />
  );
}

function Empty({ children }: { readonly children: ReactNode }) {
  return <p className="trace-empty">{children}</p>;
}

function LinksDetail({ value }: { readonly value: readonly unknown[] }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {value.map((item, index) => {
        const link = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const traceId = typeof link.traceId === "string" ? link.traceId : "";
        return (
          <li className="grid gap-1.5" key={`${traceId}:${index}`}>
            <CodeBlock value={item} label="link" maxHeight="10rem" />
            {traceId && (
              <a className="text-link text-xs" href={`/traces/${encodeURIComponent(traceId)}`}>
                Open linked trace →
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Producers report zero counts too; only a positive count means something was lost. */
function hasDropped(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.values(value as Record<string, unknown>).some(
      (count) => typeof count === "number" && count > 0,
    )
  );
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && value !== null && Object.keys(value).length === 0)
  );
}

function captureEmpty(label: "Input" | "Output", value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `${label} capture is disabled for this telemetry configuration.`;
  }
  const capture = value as Record<string, unknown>;
  if (capture.truncated === true) {
    const bytes =
      typeof capture.bytes === "number" ? capture.bytes.toLocaleString("en-US") : "configured";
    return `${label} exceeded the ${bytes}-byte capture limit.`;
  }
  return label === "Output" ? "No value was returned." : "No input value was provided.";
}

export function duration(value: number | undefined): string {
  return value === undefined ? "duration unavailable" : `${value.toLocaleString("en-US")} ms`;
}
