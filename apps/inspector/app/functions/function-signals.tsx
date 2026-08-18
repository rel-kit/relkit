import type { InspectorObject } from "../../lib/api-types";

export function FunctionSignals({
  logs,
  traces,
}: {
  readonly logs: readonly InspectorObject[];
  readonly traces: readonly InspectorObject[];
}) {
  return (
    <div className="route-contract-grid">
      <SignalPanel title="Recent logs" items={logs} kind="log" />
      <SignalPanel title="Recent traces" items={traces} kind="trace" />
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
  return (
    <section className="panel" aria-labelledby={`${kind}-signals-heading`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">OBSERVABILITY</p>
          <h2 id={`${kind}-signals-heading`}>{title}</h2>
        </div>
        <span className="badge">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="supporting-copy">No correlated {kind}s are retained.</p>
      ) : (
        <ul className="request-list">
          {items.map((item, index) => (
            <SignalRow
              key={`${text(item.traceId)}:${text(item.spanId)}:${index}`}
              item={item}
              kind={kind}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SignalRow({
  item,
  kind,
}: {
  readonly item: InspectorObject;
  readonly kind: "log" | "trace";
}) {
  const requestId = text(item.requestId) || text(item.correlationId);
  const traceId = text(item.traceId);
  const label =
    kind === "log"
      ? text(item.message) || "Structured log"
      : text(item.name) || text(item.operation) || "Trace span";
  const detail =
    kind === "log"
      ? text(item.level) || text(item.severity)
      : text(item.outcome) || text(item.status);
  return (
    <li className="request-row">
      <span>
        <strong>{bounded(label)}</strong>
        {detail === "" ? null : ` · ${bounded(detail)}`}
        <br />
        <small>
          {bounded(text(item.occurredAt) || text(item.startedAt) || "time unavailable")}
        </small>
      </span>
      <span className="request-links">
        {requestId === "" ? null : (
          <a className="text-link" href={`/requests/${encodeURIComponent(requestId)}`}>
            request
          </a>
        )}
        {traceId === "" ? (
          <span>trace unavailable</span>
        ) : (
          <a className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
            trace
          </a>
        )}
      </span>
    </li>
  );
}

function bounded(value: string): string {
  return value.length <= 120 ? value : `${value.slice(0, 96)}…${value.slice(-20)}`;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
