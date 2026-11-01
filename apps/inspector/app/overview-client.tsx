"use client";

import { useMemo } from "react";
import { OverviewShell, type OverviewSnapshot } from "./overview-shell";
import { navigationCounts } from "../lib/graph-index";
import { summarizeGraph } from "../lib/graph-model";
import { useInspectorGraph } from "../lib/use-graph";
import { RuntimeStatus } from "./runtime-status";
import { useOverviewSignals } from "./overview/use-overview-signals";

export function OverviewClient() {
  const state = useInspectorGraph();
  const graph = state.graph;
  const signals = useOverviewSignals(graph?.generationId);
  const counts = useMemo(
    () => (graph === undefined ? undefined : navigationCounts(graph)),
    [graph],
  );
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
          ...(counts === undefined ? {} : { counts }),
        }),
  } satisfies OverviewSnapshot;
  return (
    <OverviewShell
      snapshot={snapshot}
      signals={signals}
      runtime={<RuntimeStatus history={false} />}
    />
  );
}
