import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { InspectorObject } from "../../lib/api-types";
import { Section } from "../../components/blocks/section";
import { HistoryList, type HistoryEntry } from "../../components/neon/history-list";
import type { StatusTone } from "../../components/neon/status-badge";
import { Count } from "../domains/catalog-kit";

export function FunctionSignals({
  logs,
  traces,
}: {
  readonly logs: readonly InspectorObject[];
  readonly traces: readonly InspectorObject[];
}) {
  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
      <SignalPanel title="Recent traces" items={traces} kind="trace" />
      <SignalPanel title="Recent logs" items={logs} kind="log" />
    </div>
  );
}

function SignalPanel({
  title,
  items,
  kind,
}: {
  readonly title: string;
  readonly items: readonly InspectorObject[];
  readonly kind: "log" | "trace";
}) {
  const entries = items.map((item, index) => entry(item, kind, index));
  return (
    <Section
      id={`${kind}-signals`}
      aria-labelledby={`${kind}-signals-heading`}
      title={<span id={`${kind}-signals-heading`}>{title}</span>}
      description={
        kind === "trace"
          ? "Invocations correlated with this function"
          : "Structured logs it emitted"
      }
      actions={<Count value={items.length} />}
      flush
    >
      {entries.length === 0 ? (
        <p className="m-0 px-4 py-3 text-xs text-muted-foreground">
          No correlated {kind}s are retained.
        </p>
      ) : (
        <HistoryList
          label={title}
          entries={entries}
          showDurationBars={kind === "trace"}
          actions={(row) => {
            const requestId = row.attributes?.["data-request-id"];
            return requestId ? (
              <Link
                href={`/requests/${encodeURIComponent(requestId)}`}
                aria-label="Open request"
                title="Open request"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
              >
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            ) : null;
          }}
        />
      )}
    </Section>
  );
}

function entry(item: InspectorObject, kind: "log" | "trace", index: number): HistoryEntry {
  const requestId = text(item.requestId) || text(item.correlationId);
  const traceId = text(item.traceId);
  const at = text(item.timestamp) || text(item.occurredAt) || text(item.startedAt);
  if (kind === "log") {
    const level = text(item.level) || text(item.severity);
    return {
      id: `${traceId}:${text(item.spanId)}:${index}`,
      tone: logTone(level),
      statusLabel: level || "log",
      lead: level ? level.toUpperCase().slice(0, 5) : undefined,
      title: bounded(text(item.message) || "Structured log"),
      meta: [
        ...(text(item.component) ? [text(item.component)] : []),
        ...(traceId ? [`trace ${traceId.slice(0, 8)}`] : ["trace unavailable"]),
      ],
      ...(at ? { at } : {}),
      ...(traceId ? { href: `/traces/${encodeURIComponent(traceId)}` } : {}),
      ...(requestId ? { attributes: { "data-request-id": requestId } } : {}),
    };
  }
  const outcome = text(item.outcome) || text(item.status);
  const method = text(item.method);
  return {
    id: `${traceId}:${text(item.spanId)}:${index}`,
    tone: traceTone(outcome, text(item.phase), item.status),
    statusLabel: outcome || "trace",
    ...(method ? { lead: method } : {}),
    title: bounded(
      text(item.rawPath) || text(item.name) || text(item.operation) || traceId || "Trace span",
    ),
    meta: [
      ...(outcome ? [outcome] : []),
      ...(typeof item.status === "number" ? [String(item.status)] : []),
      ...(traceId ? [traceId.slice(0, 8)] : []),
    ],
    ...(typeof item.durationMs === "number" ? { durationMs: item.durationMs } : {}),
    ...(at ? { at } : {}),
    ...(traceId ? { href: `/traces/${encodeURIComponent(traceId)}` } : {}),
    ...(requestId ? { attributes: { "data-request-id": requestId } } : {}),
  };
}

function logTone(level: string): StatusTone {
  const word = level.toLowerCase();
  if (word === "error" || word === "fatal") return "danger";
  if (word === "warn" || word === "warning") return "warning";
  if (word === "debug" || word === "trace") return "neutral";
  return "info";
}

function traceTone(outcome: string, phase: string, status: unknown): StatusTone {
  if (phase && phase !== "completed") return "live";
  if (typeof status === "number")
    return status >= 500 ? "danger" : status >= 400 ? "warning" : "success";
  if (outcome === "") return "neutral";
  if (outcome === "success" || outcome === "ok") return "success";
  return /(error|defect|fail|timeout|cancel)/.test(outcome) ? "danger" : "warning";
}

function bounded(value: string): string {
  return value.length <= 120 ? value : `${value.slice(0, 96)}…${value.slice(-20)}`;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
