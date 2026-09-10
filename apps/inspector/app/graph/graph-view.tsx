"use client";

import { useCallback, useMemo, useState } from "react";
import { filterGraph, graphDomains, graphKinds } from "../../lib/graph-filter";
import { edgeLabel, type GraphNode, type GraphSnapshot } from "../../lib/graph-model";
import { GraphFlow } from "./graph-flow";
import { GraphRelationships } from "./graph-relationships";
import { OverlayDialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { withExecutionOverlay } from "../../lib/graph-execution-model";
import { GraphToolbar } from "./graph-toolbar";

export function GraphView({ graph }: { readonly graph: GraphSnapshot }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [domain, setDomain] = useState("all");
  const [selected, setSelected] = useState<GraphNode>();
  const [execution, setExecution] = useState<{
    readonly agentId: string;
    readonly value: unknown;
  }>();
  const visibleGraph = useMemo(
    () =>
      execution === undefined
        ? graph
        : withExecutionOverlay(graph, execution.agentId, execution.value),
    [execution, graph],
  );
  const filtered = useMemo(
    () => filterGraph(visibleGraph, search, kind, domain),
    [domain, kind, search, visibleGraph],
  );
  const kinds = useMemo(() => graphKinds(visibleGraph), [visibleGraph]);
  const domains = useMemo(() => graphDomains(visibleGraph), [visibleGraph]);
  const agents = useMemo(
    () => graph.nodes.flatMap((node) => (node.kind === "agent" ? [node.id] : [])),
    [graph.nodes],
  );
  const updateExecution = useCallback(
    (agentId: string, value: unknown) => setExecution({ agentId, value }),
    [],
  );
  const selectedEdges = selected
    ? filtered.edges.filter((edge) => edge.from === selected.id || edge.to === selected.id)
    : [];
  return (
    <>
      <GraphToolbar
        graph={visibleGraph}
        filteredCount={filtered.nodes.length}
        search={search}
        kind={kind}
        domain={domain}
        kinds={kinds}
        domains={domains}
        agents={agents}
        onSearch={setSearch}
        onKind={setKind}
        onDomain={setDomain}
        onOverlay={updateExecution}
      />
      <section className="panel graph-panel" aria-labelledby="canvas-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">REACT FLOW</p>
            <h2 id="canvas-heading">Capability graph</h2>
          </div>
          <GraphLegend />
        </div>
        <p className="supporting-copy">
          Deterministic positions with keyboard-focusable nodes, pan, zoom, fit view, and a minimap.
        </p>
        <GraphFlow graph={visibleGraph} filtered={filtered} onSelect={setSelected} />
      </section>
      <GraphRelationships edges={filtered.edges} />
      <OverlayDialog
        placement="right"
        title={selected?.id ?? "Graph node"}
        description="Graph-visible metadata from the active generation."
        isOpen={selected !== undefined}
        onOpenChange={(open) => !open && setSelected(undefined)}
        trigger={
          <Button className="sr-only" tabIndex={-1}>
            Open node details
          </Button>
        }
      >
        {selected && (
          <dl className="identity-grid">
            <div>
              <dt>Node ID</dt>
              <dd>{selected.id}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{selected.kind}</dd>
            </div>
            <div>
              <dt>Relationships</dt>
              <dd>{selectedEdges.length}</dd>
            </div>
            <div>
              <dt>Domain</dt>
              <dd>{selected.domainId ?? "Structural"}</dd>
            </div>
            <div>
              <dt>Layer</dt>
              <dd>{selected.observed ? "Live execution" : "Definition"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selected.status ?? "Not observed"}</dd>
            </div>
            <div>
              <dt>Labels</dt>
              <dd>{selectedEdges.map(edgeLabel).join(", ") || "None"}</dd>
            </div>
          </dl>
        )}
      </OverlayDialog>
    </>
  );
}

function GraphLegend() {
  return (
    <div className="graph-legend" aria-label="Relationship legend">
      <span className="graph-legend-item">
        <span className="legend-line legend-line--declared" aria-hidden="true" />
        Declared
      </span>
      <span className="graph-legend-item">
        <span className="legend-line legend-line--observed" aria-hidden="true" />
        Observed
      </span>
    </div>
  );
}
