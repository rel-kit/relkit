"use client";

import { ConnectionStatus } from "../overview-shell";
import { summarizeGraph } from "../../lib/graph-model";
import { useInspectorGraph } from "../../lib/use-graph";
import { GraphView } from "./graph-view";

export function GraphClient() {
  const state = useInspectorGraph();
  const graph = state.graph;
  const summary = graph === undefined ? undefined : summarizeGraph(graph);

  return (
    <div className="graph-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Graph</h1>
          <p className="lede">
            Read the active versioned graph without reconstructing application or provider state.
          </p>
        </div>
        <ConnectionStatus state={state.connection} droppedEvents={state.droppedEvents} />
      </header>

      <section className="panel graph-identity" aria-labelledby="graph-identity-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LAST KNOWN GOOD</p>
            <h2 id="graph-identity-heading">Active graph identity</h2>
          </div>
          <span className="badge">Versioned API</span>
        </div>
        <dl className="identity-grid">
          <div>
            <dt>Generation ID</dt>
            <dd>{graph?.generationId ?? "Awaiting active generation"}</dd>
          </div>
          <div>
            <dt>Graph hash</dt>
            <dd>{graph?.graphHash ?? "Graph hash unavailable"}</dd>
          </div>
        </dl>
      </section>

      {summary !== undefined && (
        <section className="graph-summary" aria-label="Graph summary">
          <SummaryCard label="Nodes" value={summary.nodeCount} />
          <SummaryCard label="Declared edges" value={summary.declaredEdgeCount} />
          <SummaryCard label="Observed edges" value={summary.observedEdgeCount} />
        </section>
      )}

      {state.loading && graph === undefined && (
        <section className="panel graph-state" role="status" aria-live="polite">
          Loading the active graph…
        </section>
      )}
      {state.error && graph === undefined && (
        <section className="panel graph-state" role="alert">
          The graph API is unavailable. The active generation has not been replaced.
        </section>
      )}
      {graph !== undefined && <GraphView graph={graph} />}
    </div>
  );
}

function SummaryCard({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="panel summary-card">
      <dt>{label}</dt>
      <dd>{value.toLocaleString("en-US")}</dd>
    </div>
  );
}
