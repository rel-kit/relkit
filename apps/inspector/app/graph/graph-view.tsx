"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { Field } from "../../components/ui/field";
import { filterGraph, graphDomains, graphKinds } from "../../lib/graph-filter";
import {
  edgeLabel,
  graphKindColor,
  type GraphNode,
  type GraphSnapshot,
} from "../../lib/graph-model";
import { GraphFlow } from "./graph-flow";
import { GraphRelationships } from "./graph-relationships";
import { OverlayDialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

export function GraphView({ graph }: { readonly graph: GraphSnapshot }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [domain, setDomain] = useState("all");
  const [selected, setSelected] = useState<GraphNode>();
  const filtered = useMemo(
    () => filterGraph(graph, search, kind, domain),
    [domain, graph, kind, search],
  );
  const kinds = useMemo(
    () => graphKinds(graph).map((id) => ({ id, label: readable(id) })),
    [graph],
  );
  const domains = useMemo(() => graphDomains(graph), [graph]);
  const selectedEdges = selected
    ? filtered.edges.filter((edge) => edge.from === selected.id || edge.to === selected.id)
    : [];
  return (
    <>
      <Card className="graph-toolbar" aria-label="Graph filters">
        <Field
          label="Search graph"
          value={search}
          onChange={setSearch}
          placeholder="Node ID or kind"
        />
        <div className="graph-kind-tabs" role="group" aria-label="Filter graph by node kind">
          <KindTab
            id="all"
            label="All kinds"
            count={graph.nodes.length}
            active={kind === "all"}
            onSelect={setKind}
          />
          {kinds.map((item) => (
            <KindTab
              key={item.id}
              id={item.id}
              label={item.label}
              count={graph.nodes.filter((node) => node.kind === item.id).length}
              active={kind === item.id}
              onSelect={setKind}
            />
          ))}
        </div>
        <div className="graph-kind-tabs" role="group" aria-label="Filter graph by domain">
          <KindTab
            id="all"
            label="All domains"
            count={graph.nodes.length}
            active={domain === "all"}
            onSelect={setDomain}
          />
          {domains.map((id) => (
            <KindTab
              key={id}
              id={id}
              label={readable(id)}
              count={graph.nodes.filter((node) => node.domainId === id).length}
              active={domain === id}
              onSelect={setDomain}
            />
          ))}
        </div>
        <Badge>
          {filtered.nodes.length} of {graph.nodes.length} nodes
        </Badge>
      </Card>
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
        <GraphFlow graph={graph} filtered={filtered} onSelect={setSelected} />
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

function KindTab({
  id,
  label,
  count,
  active,
  onSelect,
}: {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="graph-kind-tab"
      data-active={active}
      aria-pressed={active}
      style={
        {
          "--kind-color": id === "all" ? "var(--accent)" : graphKindColor(id),
        } as CSSProperties
      }
      onClick={() => onSelect(id)}
    >
      <span
        className="graph-kind-swatch"
        style={{ background: id === "all" ? "var(--accent)" : graphKindColor(id) }}
      />
      {label} <span className="graph-kind-count">{count}</span>
    </button>
  );
}

function readable(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}
