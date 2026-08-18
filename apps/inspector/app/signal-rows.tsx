import type { InspectorObject } from "../lib/api-types";
import { traceGroups, type SignalKind, text, number } from "../lib/observability-model";

export function SignalRows({
  kind,
  items,
}: {
  readonly kind: SignalKind;
  readonly items: readonly InspectorObject[];
}) {
  if (items.length === 0)
    return <p className="panel route-state">No retained {kind} match the active filters.</p>;
  return (
    <ul className="route-list" aria-label={`${kind} results`}>
      {kind === "requests" &&
        items.map((item, index) => <RequestRow item={item} key={key(item, index)} />)}
      {kind === "logs" && items.map((item, index) => <LogRow item={item} key={key(item, index)} />)}
      {kind === "traces" &&
        traceGroups(items).map((group) => <TraceRow group={group} key={group.traceId} />)}
    </ul>
  );
}

function RequestRow({ item }: { readonly item: InspectorObject }) {
  const id = text(item.requestId) || "request unavailable";
  const route = text(item.normalizedRoute) || text(item.rawPath) || "HTTP request";
  return (
    <li className="panel route-row">
      <div>
        <strong>
          {text(item.method) || "HTTP"} {route}
        </strong>
        <p className="supporting-copy">
          {text(item.outcome) || "outcome unavailable"} · HTTP {number(item.status) ?? "—"}
        </p>
      </div>
      <div className="route-row-detail">
        <span>{bounded(id)}</span>
        <span>{bounded(text(item.completedAt) || text(item.startedAt) || "time unavailable")}</span>
      </div>
      <a className="text-link" href={`/requests/${encodeURIComponent(id)}`}>
        Open request <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function LogRow({ item }: { readonly item: InspectorObject }) {
  const requestId = text(item.requestId) || text(item.correlationId);
  const traceId = text(item.traceId);
  return (
    <li className="panel route-row">
      <div>
        <strong>{bounded(text(item.message) || "Structured log")}</strong>
        <p className="supporting-copy">
          {text(item.level) || "level unavailable"} ·{" "}
          {text(item.component) || "component unavailable"}
        </p>
      </div>
      <div className="route-row-detail">
        <span>{bounded(text(item.timestamp) || "time unavailable")}</span>
        {requestId !== "" && <span>Request {bounded(requestId)}</span>}
      </div>
      <div className="request-links">
        {requestId !== "" && (
          <a className="text-link" href={`/requests/${encodeURIComponent(requestId)}`}>
            Request
          </a>
        )}
        {traceId !== "" && (
          <a className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
            Trace
          </a>
        )}
      </div>
    </li>
  );
}

function TraceRow({ group }: { readonly group: ReturnType<typeof traceGroups>[number] }) {
  return (
    <li className="panel route-row">
      <div>
        <strong>{bounded(group.traceId)}</strong>
        <p className="supporting-copy">
          {group.outcome || "outcome unavailable"} · {group.spans.length} span(s)
        </p>
      </div>
      <div className="route-row-detail">
        <span>
          {group.durationMs === undefined ? "Duration unavailable" : `${group.durationMs} ms`}
        </span>
        <span>{bounded(group.startedAt || "time unavailable")}</span>
      </div>
      <a className="text-link" href={`/traces/${encodeURIComponent(group.traceId)}`}>
        Open trace <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function key(item: InspectorObject, index: number): string {
  return `${text(item.signal)}:${text(item.requestId) || text(item.cursor) || text(item.spanId) || index}`;
}

function bounded(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 68)}…${value.slice(-20)}`;
}
