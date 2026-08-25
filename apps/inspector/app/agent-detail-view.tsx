import type { AgentView } from "../lib/agents-model";
import { SchemaPanel } from "./schema-panel";

export function AgentDetailView({ view }: { readonly view: AgentView }) {
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Agent detail</h1>
          <p className="lede">
            Model and tool execution stays bounded, correlated, and redacted at the API boundary.
          </p>
        </div>
        <span className="badge">{view.id}</span>
      </header>
      <section className="panel route-identity" aria-labelledby="agent-identity-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AGENT CONTRACT</p>
            <h2 id="agent-identity-heading">{view.id}</h2>
          </div>
          <span className="badge">{view.model || "model unavailable"}</span>
        </div>
        <dl className="route-meta">
          <Meta label="Model" value={view.model || "Unavailable"} />
          <Meta label="Generated function" value={view.generatedFunctionId} />
          <Meta label="Allowed tools" value={String(view.toolIds.length)} />
        </dl>
      </section>
      <div className="route-contract-grid">
        <JsonPanel title="Input schema" value={view.input} />
        <JsonPanel title="Output schema" value={view.output} />
      </div>
      <section className="panel" aria-labelledby="agent-limits-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BOUNDS</p>
            <h2 id="agent-limits-heading">Model and execution limits</h2>
          </div>
        </div>
        <pre className="json-panel">{format(view.limits)}</pre>
      </section>
      <ToolPanel ids={view.toolIds} />
      <TimelinePanel view={view} />
    </div>
  );
}

function ToolPanel({ ids }: { readonly ids: readonly string[] }) {
  return (
    <section className="panel" aria-labelledby="agent-tools-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ALLOWLIST</p>
          <h2 id="agent-tools-heading">Tools</h2>
        </div>
        <span className="badge">{ids.length}</span>
      </div>
      {ids.length === 0 ? (
        <p className="supporting-copy">No tools are allowed.</p>
      ) : (
        <ul className="request-list">
          {ids.map((id) => (
            <li className="request-row" key={id}>
              <a className="text-link" href={`/tools/${encodeURIComponent(id)}`}>
                {id}
              </a>
              <span>Function-backed tool</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TimelinePanel({ view }: { readonly view: AgentView }) {
  return (
    <section className="panel" aria-labelledby="agent-timeline-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">INVOCATION TIMELINE</p>
          <h2 id="agent-timeline-heading">Model and tool spans</h2>
        </div>
        <span className="badge">{view.timeline.length}</span>
      </div>
      {view.timeline.length === 0 ? (
        <p className="supporting-copy">No invocation timeline is available.</p>
      ) : (
        <ul className="request-list">
          {view.timeline.map((entry) => (
            <li className="request-row" key={`${entry.kind}:${entry.id}`}>
              <span>
                <strong>{entry.kind}</strong> <code>{entry.id}</code>
              </span>
              <span>
                {entry.status || "recorded"}
                {entry.outcome ? ` · ${entry.outcome}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="route-contract-grid">
        {view.spans.map((span) => (
          <div className="request-row" key={span.spanId}>
            <span>
              <strong>{span.kind}</strong>
              <br />
              <small>{span.functionId || span.toolId || "span"}</small>
            </span>
            <span>
              {span.profile || "profile metadata unavailable"}
              {span.toolCallId ? ` · ${span.toolCallId}` : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="supporting-copy">
        Raw instructions, prompts, tool arguments, and model results are absent by default.
      </p>
    </section>
  );
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <SchemaPanel title={title} value={value} eyebrow="SAFE SCHEMA" />;
}
function Meta({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
