"use client";

import { useMemo } from "react";
import { OverviewShell, type OverviewSnapshot } from "./overview-shell";
import { navigationCounts } from "../lib/graph-index";
import { summarizeGraph } from "../lib/graph-model";
import { useInspectorGraph } from "../lib/use-graph";
import { useInspectorState } from "../lib/stream-application-store";
import { RuntimeStatus } from "./runtime-status";
import { useOverviewSignals } from "./overview/use-overview-signals";

export function OverviewClient() {
  const state = useInspectorGraph();
  const inspector = useInspectorState();
  const graph = state.graph;
  const signals = useOverviewSignals(graph?.generationId);
  const counts = useMemo(
    () => (graph === undefined ? undefined : navigationCounts(graph)),
    [graph],
  );
  const snapshot = {
    connection: inspector.stream,
    application: inspector.application,
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
      signals={{ ...signals, storage: inspector.status }}
      runtime={<RuntimeStatus history={false} />}
    />
  );
}
