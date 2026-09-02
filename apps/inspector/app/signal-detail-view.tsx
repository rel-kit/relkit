import type { InspectorObject } from "../lib/api-types";
import { text, number, type SignalKind } from "../lib/observability-model";
import {
  LogsPanel,
  RequestsPanel,
  RequestExchangePanel,
  TimelinePanel,
  WaterfallPanel,
} from "./signal-detail-sections";
import { RuntimeStatus } from "./runtime-status";

interface SignalDetailViewProps {
  readonly kind: SignalKind;
  readonly id: string;
  readonly request?: InspectorObject;
  readonly trace?: InspectorObject;
  readonly records: readonly InspectorObject[];
  readonly spans: readonly InspectorObject[];
  readonly logs: readonly InspectorObject[];
  readonly requests: readonly InspectorObject[];
  readonly liveState: string;
}

export function SignalDetailView(props: SignalDetailViewProps) {
  const isRequest = props.kind === "requests";
  const request = props.request;
  const trace = props.trace;
  const traceId = text(request?.traceId) || text(trace?.traceId);
  const title = isRequest ? "Request detail" : "Trace detail";
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>{title}</h1>
          <p className="lede">
            Complete local telemetry is rendered from redacted versioned records before export
            sampling.
          </p>
        </div>
        <div className="signal-status" role="status" aria-live="polite">
          <span className="badge">Live: {props.liveState}</span>
        </div>
      </header>
      <RuntimeStatus telemetryOnly />
      <IdentityPanel
        kind={props.kind}
        id={props.id}
        {...(request === undefined ? {} : { request })}
        {...(trace === undefined ? {} : { trace })}
      />
      {isRequest && request !== undefined && <RequestExchangePanel request={request} />}
      {isRequest && request !== undefined && (
        <TimelinePanel request={request} records={props.records} />
      )}
      {!isRequest && <WaterfallPanel spans={props.spans} />}
      {isRequest && traceId !== "" && (
        <p className="panel supporting-copy">
          Correlated trace:{" "}
          <a className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
            {bounded(traceId)}
          </a>
        </p>
      )}
      {!isRequest && props.requests.length > 0 && <RequestsPanel items={props.requests} />}
      <LogsPanel items={props.logs} />
    </div>
  );
}

function IdentityPanel({
  kind,
  id,
  request,
  trace,
}: {
  readonly kind: SignalKind;
  readonly id: string;
  readonly request?: InspectorObject;
  readonly trace?: InspectorObject;
}) {
  const value = request ?? trace ?? {};
  const label = kind === "requests" ? "REQUEST RECORD" : "TRACE RECORD";
  return (
    <section className="panel identity-panel" aria-labelledby="signal-identity-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{label}</p>
          <h2 id="signal-identity-heading">{bounded(id)}</h2>
        </div>
        <span className="badge">Redaction-first</span>
      </div>
      <dl className="route-meta">
        <Meta label="Trace ID" value={text(value.traceId) || "Unavailable"} />
        <Meta label="Outcome" value={text(value.outcome) || "Unavailable"} />
        <Meta
          label="Status"
          value={number(value.status) === undefined ? "Unavailable" : String(value.status)}
        />
        <Meta label="Started" value={text(value.startedAt) || "Unavailable"} />
        <Meta label="Completed" value={text(value.completedAt) || "In progress"} />
        <Meta
          label="Duration"
          value={number(value.durationMs) === undefined ? "Unavailable" : `${value.durationMs} ms`}
        />
      </dl>
    </section>
  );
}

function Meta({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{bounded(value)}</dd>
    </div>
  );
}

function bounded(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 68)}…${value.slice(-20)}`;
}
