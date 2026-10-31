"use client";

import { Suspense } from "react";
import { useInspectorGraph } from "../../lib/use-graph";
import { GraphExplorer } from "./graph-explorer";

export function GraphClient() {
  const state = useInspectorGraph();
  const graph = state.graph;

  return (
    <div className="graph-workspace">
      <h1 className="sr-only">Application graph</h1>
      {state.loading && graph === undefined && (
        <section className="graph-workspace__state" role="status" aria-live="polite">
          Loading the active graph…
        </section>
      )}
      {state.error && graph === undefined && (
        <section className="graph-workspace__state" role="alert">
          The graph API is unavailable. The active generation has not been replaced.
        </section>
      )}
      {graph !== undefined && (
        <Suspense
          fallback={
            <section className="graph-workspace__state" role="status">
              Opening the explorer…
            </section>
          }
        >
          <GraphExplorer graph={graph} />
        </Suspense>
      )}
    </div>
  );
}
