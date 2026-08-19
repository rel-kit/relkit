"use client";

import { OverviewShell, type OverviewSnapshot } from "./overview-shell";
import { summarizeGraph } from "../lib/graph-model";
import { useInspectorGraph } from "../lib/use-graph";

export function OverviewClient() {
  const state = useInspectorGraph();
  const graph = state.graph;
  const snapshot = {
    connection: state.connection,
    droppedEvents: state.droppedEvents,
    ...(graph === undefined
      ? {}
      : {
          generationId: graph.generationId,
          graphHash: graph.graphHash,
          graphSummary: summarizeGraph(graph),
        }),
  } satisfies OverviewSnapshot;
  return <OverviewShell snapshot={snapshot} />;
}
