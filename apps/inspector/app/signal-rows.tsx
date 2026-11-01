import { Inbox } from "lucide-react";
import { EmptyState } from "../components/neon/empty-state";
import { HistoryList, type HistoryEntry } from "../components/neon/history-list";
import "./requests/requests.css";
import type { StatusTone } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import { middleTruncate } from "../lib/format";
import { signalKey, text, number } from "../lib/observability-model";

/** Retained HTTP requests as Neon QueryHistory rows; each row opens its request detail. */
export function SignalRows({ items }: { readonly items: readonly InspectorObject[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        size="sm"
        variant="bare"
        icon={<Inbox />}
        title="No retained requests match the active filters."
        description="Requests appear here as the application serves them."
      />
    );
  return (
    <HistoryList
      label="Request results"
      className="request-history"
      entries={items.map(requestEntry)}
    />
  );
}

/** One retained request as a history row linking to its detail page. */
export function requestEntry(item: InspectorObject): HistoryEntry {
  const id = text(item.requestId);
  const method = text(item.method) || "HTTP";
  const status = number(item.status);
  const outcome = text(item.outcome);
  const tone = requestTone(outcome, status, text(item.phase));
  const traceId = text(item.traceId);
  const owner = known(text(item.routeId)) || known(text(item.functionId));
  const at = text(item.completedAt) || text(item.startedAt);
  const durationMs = number(item.durationMs);
  const statusWord = [outcome || (tone === "live" ? "in progress" : "unknown"), status]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
  return {
    id: signalKey(item),
    tone,
    statusLabel: id ? `Open request, ${statusWord}` : statusWord,
    lead: (
      <span className="route-method" data-method={method}>
        {method}
      </span>
    ),
    title: bounded(requestPath(item) || "request"),
    meta: [
      ...(status === undefined ? [] : [<span key="status">{status}</span>]),
      <span key="id" title={id || undefined}>
        {id ? middleTruncate(id, 36) : "id unavailable"}
      </span>,
      ...(owner ? [<span key="owner">{middleTruncate(owner, 32)}</span>] : []),
      ...(traceId
        ? [
            <span key="trace" title={traceId}>
              trace {traceId.slice(0, 8)}
            </span>,
          ]
        : []),
    ],
    ...(at ? { at } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(id ? { href: `/requests/${encodeURIComponent(id)}` } : {}),
  };
}

function requestTone(outcome: string, status: number | undefined, phase: string): StatusTone {
  if (outcome === "success") return status !== undefined && status >= 400 ? "warning" : "success";
  if (outcome === "timeout" || outcome === "cancelled") return "warning";
  if (outcome !== "") return "danger";
  if (status !== undefined) return status >= 500 ? "danger" : status >= 400 ? "warning" : "success";
  return phase === "completed" ? "neutral" : "live";
}

/** The path people recognise: the raw path, else the normalized route when it is known. */
export function requestPath(item: InspectorObject): string {
  return text(item.rawPath) || known(text(item.normalizedRoute));
}

function known(value: string): string {
  return value === "unknown" ? "" : value;
}

function bounded(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 68)}…${value.slice(-20)}`;
}
