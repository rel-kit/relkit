import type { InspectorObject } from "../lib/api-types";
import { requestTimeline, signalKey, text, type TimelineEntry } from "../lib/observability-model";
import { TraceWaterfall } from "./trace-waterfall";

export function TimelinePanel({
  request,
  records,
}: {
  readonly request: InspectorObject;
  readonly records: readonly InspectorObject[];
}) {
  const entries = requestTimeline(request, records);
  return (
    <section className="panel" aria-labelledby="request-timeline-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">REQUEST TIMELINE</p>
          <h2 id="request-timeline-heading">Correlated work</h2>
        </div>
        <span className="badge">{entries.length} steps</span>
      </div>
      <ol className="request-list signal-timeline">
        {entries.map((entry) => (
          <TimelineRow entry={entry} key={entry.id} />
        ))}
      </ol>
    </section>
  );
}

function TimelineRow({ entry }: { readonly entry: TimelineEntry }) {
  return (
    <li className="request-row">
      <span>
        <strong>{entry.kind}</strong>
        {entry.targetId ? ` · ${bounded(entry.targetId)}` : ""}
      </span>
      <span>
        {entry.outcome || entry.status || "recorded"} · {bounded(entry.at)}
      </span>
    </li>
  );
}

export function WaterfallPanel({ spans }: { readonly spans: readonly InspectorObject[] }) {
  return <TraceWaterfall spans={spans} />;
}

export function RequestExchangePanel({ request }: { readonly request: InspectorObject }) {
  return (
    <section className="panel" aria-labelledby="request-exchange-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">REQUEST / RESPONSE</p>
          <h2 id="request-exchange-heading">Payload and headers</h2>
        </div>
        <span className="badge">Redaction-first</span>
      </div>
      <div className="exchange-grid">
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
      <p className="supporting-copy">
        Bodies and protected headers appear only when the active backend explicitly enables bounded,
        redacted development capture. Otherwise they are intentionally not retained.
      </p>
    </section>
  );
}

function CapturePanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return (
    <div className="capture-panel">
      <h3>{title}</h3>
      {value === undefined ? (
        <p className="schema-empty">Not retained by the active backend.</p>
      ) : (
        <DataValue value={value} />
      )}
    </div>
  );
}

function DataValue({ value }: { readonly value: unknown }) {
  if (value === null || typeof value !== "object")
    return <code className="schema-value">{String(value)}</code>;
  return <pre className="safe-json">{safeJson(value)}</pre>;
}

function first(value: InspectorObject, ...keys: readonly string[]): unknown {
  return keys.map((key) => value[key]).find((item) => item !== undefined);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unavailable";
  }
}

export function RequestsPanel({ items }: { readonly items: readonly InspectorObject[] }) {
  return (
    <section className="panel" aria-labelledby="trace-requests-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CORRELATED REQUESTS</p>
          <h2 id="trace-requests-heading">HTTP records</h2>
        </div>
        <span className="badge">{items.length}</span>
      </div>
      <ul className="request-list">
        {items.map((item) => {
          const id = text(item.requestId);
          return (
            <li className="request-row" key={signalKey(item)}>
              <span>
                <strong>{text(item.method) || "HTTP"}</strong>{" "}
                {bounded(text(item.normalizedRoute) || text(item.rawPath))}
              </span>
              {id === "" ? (
                <span>Request ID unavailable</span>
              ) : (
                <a className="text-link" href={`/requests/${encodeURIComponent(id)}`}>
                  Open request <span aria-hidden="true">→</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LogsPanel({ items }: { readonly items: readonly InspectorObject[] }) {
  return (
    <section className="panel" aria-labelledby="correlated-logs-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CORRELATED LOGS</p>
          <h2 id="correlated-logs-heading">Structured messages</h2>
        </div>
        <span className="badge">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="supporting-copy">No correlated logs are retained.</p>
      ) : (
        <ul className="request-list">
          {items.map((item) => (
            <li className="request-row" key={signalKey(item)}>
              <span>
                <strong>{bounded(text(item.message) || "Structured log")}</strong>
                <br />
                <small>
                  {text(item.level) || "level unavailable"} ·{" "}
                  {bounded(text(item.timestamp) || "time unavailable")}
                </small>
              </span>
              <span>{bounded(text(item.component) || "component unavailable")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function bounded(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 68)}…${value.slice(-20)}`;
}
