import Link from "next/link";
import { CodeBlock } from "../components/blocks/code-block";
import { Section } from "../components/blocks/section";
import { EmptyState } from "../components/neon/empty-state";
import { HistoryList } from "../components/neon/history-list";
import { StatusBadge } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import { middleTruncate } from "../lib/format";
import { signalKey, text } from "../lib/observability-model";
import { cn } from "../lib/utils";
import { AnsiText, stripAnsi } from "./logs/ansi-text";
import { levelClass, logClock } from "./logs/log-format";
import { requestEntry } from "./signal-rows";
import { TraceWaterfall } from "./trace-waterfall";

export function TimelinePanel({
  request,
  spans,
}: {
  readonly request: InspectorObject;
  readonly spans: readonly InspectorObject[];
}) {
  return <TraceWaterfall spans={spans} requests={[request]} />;
}

export function WaterfallPanel({
  spans,
  requests,
}: {
  readonly spans: readonly InspectorObject[];
  readonly requests: readonly InspectorObject[];
}) {
  return <TraceWaterfall spans={spans} requests={requests} />;
}

export function RequestExchangePanel({ request }: { readonly request: InspectorObject }) {
  return (
    <Section
      id="request-exchange"
      title="Payload and headers"
      description="Redaction-first capture"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <CapturePanel title="Request headers" value={first(request, "requestHeaders", "headers")} />
        <CapturePanel
          title="Request payload"
          value={first(request, "requestBody", "requestPayload", "body")}
        />
        <CapturePanel title="Response headers" value={first(request, "responseHeaders")} />
        <CapturePanel
          title="Response body"
          value={first(request, "responseBody", "responsePayload")}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Bodies and protected headers appear only when the active backend explicitly enables bounded,
        redacted development capture. Otherwise they are intentionally not retained.
      </p>
    </Section>
  );
}

function CapturePanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {value === undefined ? (
        <p className="schema-empty m-0 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          Not retained by the active backend.
        </p>
      ) : value === null || typeof value !== "object" ? (
        <code className="schema-value rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
          {String(value)}
        </code>
      ) : (
        <CodeBlock value={safeValue(value)} label={title.toLowerCase()} maxHeight="14rem" />
      )}
    </div>
  );
}

function first(value: InspectorObject, ...keys: readonly string[]): unknown {
  return keys.map((key) => value[key]).find((item) => item !== undefined);
}

function safeValue(value: unknown): unknown {
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return "Unavailable";
  }
}

export function ContinuationsPanel({
  items,
  incomplete,
}: {
  readonly items: readonly InspectorObject[];
  readonly incomplete: readonly string[];
}) {
  return (
    <Section
      id="continuations"
      title="Continuations"
      description="Linked async work: event and job traces started by this request."
      actions={<span className="font-mono text-[11px] text-muted-foreground">{items.length}</span>}
      flush
    >
      {items.length === 0 ? (
        <EmptyState size="sm" variant="bare" title="No linked event or job traces are retained." />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => {
            const traceId = text(item.traceId);
            const running = item.active === true;
            return (
              <li
                key={traceId}
                className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2 last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StatusBadge
                    tone={running ? "live" : "neutral"}
                    label={running ? "Running" : "Recorded"}
                  />
                  <code className="truncate font-mono text-xs text-foreground" title={traceId}>
                    {middleTruncate(traceId, 40)}
                  </code>
                </span>
                <Link
                  className="text-link shrink-0 text-xs"
                  href={`/traces/${encodeURIComponent(traceId)}`}
                >
                  Open trace <span aria-hidden="true">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {incomplete.length > 0 && (
        <div
          className="border-t border-border bg-warning-soft px-4 py-2 text-xs text-foreground"
          role="status"
        >
          Incomplete telemetry: {incomplete.join(", ")}.
        </div>
      )}
    </Section>
  );
}

export function RequestsPanel({ items }: { readonly items: readonly InspectorObject[] }) {
  const current = new Map<string, InspectorObject>();
  for (const item of items) {
    const id = text(item.requestId);
    const prior = current.get(id);
    if (!prior || (prior.phase !== "completed" && item.phase === "completed"))
      current.set(id, item);
  }
  return (
    <Section
      id="trace-requests"
      title="HTTP records"
      description="Requests correlated with this trace."
      actions={<span className="font-mono text-[11px] text-muted-foreground">{current.size}</span>}
      flush
    >
      <HistoryList
        label="Correlated HTTP records"
        className="request-history"
        entries={[...current.values()].map(requestEntry)}
      />
    </Section>
  );
}

export function LogsPanel({ items }: { readonly items: readonly InspectorObject[] }) {
  return (
    <Section
      id="correlated-logs"
      title="Correlated logs"
      description="Structured messages emitted while this work ran."
      actions={<span className="font-mono text-[11px] text-muted-foreground">{items.length}</span>}
      flush
    >
      {items.length === 0 ? (
        <EmptyState size="sm" variant="bare" title="No correlated logs are retained." />
      ) : (
        <ul className="neon-scroll-fade m-0 max-h-[28rem] list-none overflow-auto p-0 font-mono text-[11.5px] leading-5">
          {items.map((item) => {
            const cursor = text(item.cursor);
            const level = text(item.level);
            const timestamp = text(item.timestamp);
            const clock = logClock(timestamp);
            const message = text(item.message);
            const row = (
              <>
                <span
                  className="w-[6.5rem] shrink-0 text-muted-foreground/80 tabular-nums"
                  title={timestamp}
                >
                  {clock.day ? `${clock.day} ` : ""}
                  {clock.time}
                </span>
                <span
                  className={cn(
                    "w-11 shrink-0 text-[10.5px] font-semibold uppercase",
                    levelClass(level),
                  )}
                >
                  {level || "—"}
                </span>
                <span
                  className="hidden w-40 shrink-0 truncate text-muted-foreground sm:block"
                  title={text(item.component)}
                >
                  {text(item.component) || "—"}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-foreground"
                  title={stripAnsi(message)}
                >
                  {message ? <AnsiText value={message} /> : "Structured log"}
                </span>
              </>
            );
            const rowClass =
              "flex min-w-0 items-center gap-3 px-4 py-1 no-underline transition-colors hover:bg-muted/40";
            return (
              <li key={signalKey(item)} className="border-b border-border/50 last:border-b-0">
                {cursor ? (
                  <Link className={rowClass} href={`/logs?log=${encodeURIComponent(cursor)}`}>
                    {row}
                  </Link>
                ) : (
                  <div className={rowClass}>{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
