import type { GraphSummary } from "../lib/graph-model";
import type { ReactNode } from "react";
import type { ActivationFingerprint } from "../lib/graph-topology-model";
import { ActivationCohort } from "./activation-cohort";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

export interface OverviewSnapshot {
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly connection?: ConnectionState;
  readonly droppedEvents?: number;
  readonly graphSummary?: GraphSummary;
  readonly activationFingerprint?: ActivationFingerprint;
}

const EMPTY_SNAPSHOT: OverviewSnapshot = Object.freeze({ connection: "connecting" });

const connectionLabels: Record<ConnectionState, string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  offline: "Offline",
};

function boundedLabel(value: string | undefined, fallback: string): string {
  if (value === undefined || value.trim() === "") return fallback;
  const label = value.trim();
  return label.length <= 96 ? label : `${label.slice(0, 48)}…${label.slice(-24)}`;
}

function droppedEventLabel(value: number | undefined): string {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1)
    return "No dropped events reported";
  return `${Math.min(value, 999_999)} dropped event${value === 1 ? "" : "s"}`;
}

export function ConnectionStatus({
  state = "connecting",
  droppedEvents,
}: {
  readonly state?: ConnectionState;
  readonly droppedEvents?: number;
}) {
  return (
    <div className="connection-status" data-state={state} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span>{connectionLabels[state]}</span>
      <span className="status-detail">{droppedEventLabel(droppedEvents)}</span>
    </div>
  );
}

export function OverviewShell({
  snapshot = EMPTY_SNAPSHOT,
  runtime,
}: {
  readonly snapshot?: OverviewSnapshot;
  readonly runtime?: ReactNode;
}) {
  const generationId = boundedLabel(snapshot.generationId, "Awaiting active generation");
  const graphHash = boundedLabel(snapshot.graphHash, "Graph hash unavailable");
  const summary = snapshot.graphSummary;

  return (
    <div className="overview-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Overview</h1>
          <p className="lede">
            Follow the active generation through the versioned inspector protocol.
          </p>
        </div>
        <ConnectionStatus state={snapshot.connection} droppedEvents={snapshot.droppedEvents} />
      </header>

      <section className="panel identity-panel" aria-labelledby="identity-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LAST KNOWN GOOD</p>
            <h2 id="identity-heading">Active generation</h2>
          </div>
          <span className="badge">Protocol API</span>
        </div>
        <dl className="identity-grid">
          <div>
            <dt>Generation ID</dt>
            <dd data-testid="active-generation">{generationId}</dd>
          </div>
          <div>
            <dt>Graph hash</dt>
            <dd data-testid="graph-hash">{graphHash}</dd>
          </div>
        </dl>
        <p className="supporting-copy">
          Candidate failures remain diagnostics; they do not replace the active generation.
        </p>
      </section>

      <ActivationCohort
        graphHash={snapshot.graphHash ?? ""}
        {...(snapshot.activationFingerprint === undefined
          ? {}
          : { fingerprint: snapshot.activationFingerprint })}
      />
      {runtime}

      <section className="panel graph-overview" aria-labelledby="graph-overview-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CANONICAL GRAPH</p>
            <h2 id="graph-overview-heading">Active capabilities</h2>
          </div>
          <span className="badge">Protocol data</span>
        </div>
        {summary === undefined ? (
          <p className="supporting-copy">Waiting for the versioned graph response.</p>
        ) : (
          <div className="overview-metrics">
            <div>
              <dt>Nodes</dt>
              <dd data-testid="graph-node-count">{summary.nodeCount.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Declared edges</dt>
              <dd data-testid="graph-declared-edge-count">
                {summary.declaredEdgeCount.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt>Observed edges</dt>
              <dd data-testid="graph-observed-edge-count">
                {summary.observedEdgeCount.toLocaleString("en-US")}
              </dd>
            </div>
          </div>
        )}
        <a className="text-link" href="/graph">
          Inspect relationships <span aria-hidden="true">→</span>
        </a>
      </section>

      <div className="overview-grid">
        <section className="panel" aria-labelledby="signals-heading">
          <p className="eyebrow">OBSERVABILITY</p>
          <h2 id="signals-heading">Signals stay correlated</h2>
          <p className="supporting-copy">
            Complete redacted requests, logs, traces, and generation changes are retained before
            external sampling.
          </p>
          <a className="text-link" href="/requests">
            View recent requests <span aria-hidden="true">→</span>
          </a>
        </section>
        <section className="panel" aria-labelledby="payload-heading">
          <p className="eyebrow">PAYLOAD SAFETY</p>
          <h2 id="payload-heading">Sensitive content stays hidden</h2>
          <p className="supporting-copy">
            Request and response bodies, cookies, authorization values, secrets, and provider
            clients are not rendered by default.
          </p>
          <span className="safe-mark">Redaction-first view</span>
        </section>
      </div>

      <section className="panel next-panel" aria-labelledby="next-heading">
        <p className="eyebrow">START HERE</p>
        <h2 id="next-heading">Explore the active graph</h2>
        <p className="supporting-copy">
          Use the navigation to inspect declared capabilities and their observed relationships. The
          shell remains usable while a candidate is compiling or reconnecting.
        </p>
        <a className="button-link" href="/graph">
          Open graph <span aria-hidden="true">↗</span>
        </a>
      </section>
    </div>
  );
}
