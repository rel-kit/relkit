import type { InspectorObject } from "../lib/api-types";
import { requestTimeline, text, type TimelineEntry, waterfall } from "../lib/observability-model";

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
        {entries.map((entry, index) => (
          <TimelineRow entry={entry} key={`${entry.kind}:${entry.at}:${index}`} />
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
  const items = waterfall(spans);
  return (
    <section className="panel" aria-labelledby="trace-waterfall-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TRACE WATERFALL</p>
          <h2 id="trace-waterfall-heading">Span hierarchy and timing</h2>
        </div>
        <span className="badge">{items.length} spans</span>
      </div>
      {items.length === 0 ? (
        <p className="supporting-copy">No spans are retained for this trace.</p>
      ) : (
        <ol className="waterfall-list" aria-label="Accessible span waterfall">
          {items.map((span) => (
            <li className="waterfall-row" key={span.spanId}>
              <div className="waterfall-label" style={{ paddingLeft: `${span.depth * 1.1}rem` }}>
                <strong>{bounded(span.name)}</strong>
                <small>
                  {bounded(span.spanId)} · {span.outcome || span.status || "recorded"}
                </small>
              </div>
              <div
                className="waterfall-track"
                aria-label={`${span.name}, ${span.durationMs ?? 0} milliseconds`}
              >
                <span
                  style={{ marginLeft: `${span.offsetPercent}%`, width: `${span.widthPercent}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
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
        {items.map((item, index) => {
          const id = text(item.requestId) || `request-${index}`;
          return (
            <li className="request-row" key={id}>
              <span>
                <strong>{text(item.method) || "HTTP"}</strong>{" "}
                {bounded(text(item.normalizedRoute) || text(item.rawPath))}
              </span>
              <a className="text-link" href={`/requests/${encodeURIComponent(id)}`}>
                Open request <span aria-hidden="true">→</span>
              </a>
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
          {items.map((item, index) => (
            <li className="request-row" key={`${text(item.cursor)}:${index}`}>
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
