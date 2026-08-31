import type { InspectorObject } from "../../lib/api-types";
import { SourceLink } from "../source-link";
import { SchemaPanel } from "../schema-panel";

export function FunctionContract({
  node,
  declaredEdges,
  observedEdges,
}: {
  readonly node: InspectorObject;
  readonly declaredEdges: readonly InspectorObject[];
  readonly observedEdges: readonly InspectorObject[];
}) {
  const source = record(node.source);
  return (
    <>
      <section className="panel route-identity" aria-labelledby="function-contract-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FUNCTION CONTRACT</p>
            <h2 id="function-contract-heading">{text(node.id) || "Unknown function"}</h2>
          </div>
          <span className="badge">{text(node.invocationMode) || "callable"}</span>
        </div>
        <dl className="route-meta">
          <div>
            <dt>Source</dt>
            <dd>
              <SourceLink source={source} />
            </dd>
          </div>
          <div>
            <dt>Timeout</dt>
            <dd>{limit(node.timeoutMs, "default")}</dd>
          </div>
          <div>
            <dt>Concurrency</dt>
            <dd>{limit(node.concurrency, "default")}</dd>
          </div>
        </dl>
      </section>
      <div className="route-contract-grid">
        <JsonPanel title="Input schema" value={node.input} />
        <JsonPanel title="Output schema" value={node.output} />
        <JsonPanel title="Declared errors" value={node.errors} />
        <JsonPanel title="Declared dependencies" value={node.dependencies} />
      </div>
      <EdgePanel
        title="Declared edges"
        edges={declaredEdges}
        relationship="declared"
        id={text(node.id)}
      />
      <EdgePanel
        title="Observed recent edges"
        edges={observedEdges}
        relationship="observed"
        id={text(node.id)}
      />
    </>
  );
}

function EdgePanel({
  title,
  edges,
  relationship,
  id,
}: {
  readonly title: string;
  readonly edges: readonly InspectorObject[];
  readonly relationship: "declared" | "observed";
  readonly id: string;
}) {
  return (
    <section
      className="panel relationship-panel"
      aria-labelledby={`${relationship}-function-edges`}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">GRAPH RELATIONSHIPS</p>
          <h2 id={`${relationship}-function-edges`}>{title}</h2>
        </div>
        <span className="badge">{edges.length}</span>
      </div>
      {edges.length === 0 ? (
        <p className="supporting-copy">No {relationship} edges are reported.</p>
      ) : (
        <ul className="relationship-list">
          {edges.map((edge, index) => {
            const from = text(edge.from);
            const to = text(edge.to);
            const direction = to === id ? "Incoming" : from === id ? "Outgoing" : "Related";
            return (
              <li
                className={`relationship-row relationship-row--${relationship}`}
                key={`${from}:${to}:${index}`}
              >
                <span className="relationship-marker" aria-hidden="true" />
                <span className="relationship-type">
                  {relationship} · {direction}
                </span>
                <code>{from || "unknown"}</code>
                <span aria-hidden="true">→</span>
                <code>{to || "unknown"}</code>
                <span className="relationship-kind">
                  {text(edge.kind) || text(edge.relationship) || "edge"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <SchemaPanel title={title} value={value} eyebrow="CONTRACT DATA" />;
}
function limit(value: unknown, fallback: string): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : fallback;
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
