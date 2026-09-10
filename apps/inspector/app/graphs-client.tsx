"use client";

import Link from "next/link";
import { ConnectionStatus } from "./overview-shell";
import { Badge } from "../components/ui/badge";
import { useInspectorGraph } from "../lib/use-graph";
import { workflowDefinitions } from "../lib/workflow-definition-model";

export function GraphsClient() {
  const state = useInspectorGraph();
  const graphs = state.source === undefined ? [] : workflowDefinitions(state.source);
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW DEFINITIONS</p>
          <h1>Graphs</h1>
          <p className="lede">
            Registered `defineGraph` state, nodes, branches, joins, loops, and destinations.
          </p>
        </div>
        <ConnectionStatus state={state.connection} droppedEvents={state.droppedEvents} />
      </header>
      {state.loading && state.source === undefined ? (
        <section className="panel graph-state" role="status">
          Loading graph definitions…
        </section>
      ) : state.error && state.source === undefined ? (
        <section className="panel graph-state" role="alert">
          The graph API is unavailable.
        </section>
      ) : graphs.length === 0 ? (
        <section className="panel graph-state">
          No `defineGraph` definitions are registered.
        </section>
      ) : (
        <section className="panel" aria-labelledby="graph-list-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACTIVE GENERATION</p>
              <h2 id="graph-list-heading">Graph definitions</h2>
            </div>
            <Badge>{graphs.length}</Badge>
          </div>
          <ul className="request-list">
            {graphs.map((graph) => (
              <li className="request-row" key={graph.id}>
                <span>
                  <strong>{graph.id}</strong>
                  <br />
                  <small>{graph.domainId ?? "No domain"}</small>
                </span>
                <span>
                  {graph.nodeCount} nodes · {graph.parallelCount} parallel ·{" "}
                  {graph.conditionalCount} conditional · {graph.loopCount} loops
                </span>
                <Link className="text-link" href={`/graphs/${encodeURIComponent(graph.id)}`}>
                  Open graph
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
