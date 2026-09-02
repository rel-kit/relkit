"use client";

import { OverviewShell, type OverviewSnapshot } from "./overview-shell";
import { summarizeGraph } from "../lib/graph-model";
import { useInspectorGraph } from "../lib/use-graph";
import { RuntimeStatus } from "./runtime-status";

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
          ...(graph.activationFingerprint === undefined
            ? {}
            : { activationFingerprint: graph.activationFingerprint }),
          graphSummary: summarizeGraph(graph),
        }),
  } satisfies OverviewSnapshot;
  return <OverviewShell snapshot={snapshot} runtime={<RuntimeStatus />} />;
}
