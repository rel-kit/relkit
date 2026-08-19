import type {
  DiagnosticView,
  DiagnosticsSnapshot,
  GenerationView,
} from "../lib/env-diagnostics-model";
import { SourceLink } from "./source-link";

export function DiagnosticsView({
  snapshot,
  state,
  liveState,
}: {
  readonly snapshot: DiagnosticsSnapshot | undefined;
  readonly state: "loading" | "ready" | "error";
  readonly liveState: string;
}) {
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DEVELOPMENT SIGNALS</p>
          <h1>Diagnostics</h1>
          <p className="lede">
            Candidate failures stay visible without replacing the last-known-good active generation.
          </p>
        </div>
        <div className="signal-status" role="status" aria-live="polite">
          <span className="badge">Live: {liveState}</span>
          {state === "loading" && <span>Refreshing diagnostics…</span>}
        </div>
      </header>
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The diagnostics API is unavailable. Previously loaded active and candidate data remains
          visible.
        </p>
      )}
      {state === "loading" && snapshot === undefined && (
        <p className="panel route-state" role="status">
          Loading diagnostics…
        </p>
      )}
      {snapshot !== undefined && <IdentityPanel identity={snapshot.active.identity} />}
      {snapshot !== undefined && (
        <DiagnosticPanel
          eyebrow="ACTIVE GENERATION"
          title="Active diagnostics"
          items={snapshot.active.items}
          empty="No active-generation diagnostics are reported."
        />
      )}
      {snapshot?.candidate !== undefined && (
        <section className="panel" aria-labelledby="candidate-diagnostics-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CANDIDATE OVERLAY</p>
              <h2 id="candidate-diagnostics-heading">Candidate diagnostics</h2>
            </div>
            <span className="badge">{snapshot.status}</span>
          </div>
          <Identity identity={snapshot.candidate.identity} />
          <DiagnosticRows
            items={snapshot.candidate.items}
            empty="No diagnostics are reported for the candidate."
          />
        </section>
      )}
      {snapshot?.candidate === undefined && snapshot !== undefined && (
        <p className="panel route-state">No candidate generation is currently being evaluated.</p>
      )}
    </div>
  );
}

function IdentityPanel({ identity }: { readonly identity: GenerationView }) {
  return (
    <section className="panel identity-panel" aria-labelledby="diagnostics-identity-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LAST KNOWN GOOD</p>
          <h2 id="diagnostics-identity-heading">Active generation</h2>
        </div>
        <span className="badge">{identity.role}</span>
      </div>
      <Identity identity={identity} />
    </section>
  );
}

function Identity({ identity }: { readonly identity: GenerationView }) {
  return (
    <dl className="identity-grid">
      <div>
        <dt>Generation ID</dt>
        <dd>{identity.generationId}</dd>
      </div>
      <div>
        <dt>Graph hash</dt>
        <dd>{identity.graphHash}</dd>
      </div>
      {identity.sourceVersion !== undefined && (
        <div>
          <dt>Source version</dt>
          <dd>{identity.sourceVersion}</dd>
        </div>
      )}
      {(identity.state !== undefined || identity.status !== undefined) && (
        <div>
          <dt>Candidate status</dt>
          <dd>{identity.status ?? identity.state}</dd>
        </div>
      )}
    </dl>
  );
}

function DiagnosticPanel({
  eyebrow,
  title,
  items,
  empty,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly items: readonly DiagnosticView[];
  readonly empty: string;
}) {
  return (
    <section className="panel" aria-labelledby="active-diagnostics-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id="active-diagnostics-heading">{title}</h2>
      <DiagnosticRows items={items} empty={empty} />
    </section>
  );
}

function DiagnosticRows({
  items,
  empty,
}: {
  readonly items: readonly DiagnosticView[];
  readonly empty: string;
}) {
  if (items.length === 0) return <p className="supporting-copy">{empty}</p>;
  return (
    <ul className="request-list">
      {items.map((item, index) => (
        <li className="request-row" key={`${item.code}-${item.source?.file ?? "none"}-${index}`}>
          <div>
            <strong>
              <span className={`route-method diagnostic-${item.severity}`}>{item.severity}</span>{" "}
              {item.code}
            </strong>
            <p className="supporting-copy">{item.message}</p>
          </div>
          <div className="route-row-detail">
            {item.descriptorId !== undefined && <span>Descriptor: {item.descriptorId}</span>}
            {item.source !== undefined && (
              <span>
                Source: <SourceLink source={item.source} />
              </span>
            )}
            {item.suggestion !== undefined && <span>Suggestion: {item.suggestion}</span>}
            {item.documentationPath !== undefined && <span>Docs: {item.documentationPath}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
