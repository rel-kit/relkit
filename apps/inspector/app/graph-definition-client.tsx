"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { OverlayDialog } from "../components/ui/dialog";
import { filterGraph } from "../lib/graph-filter";
import type { GraphNode } from "../lib/graph-model";
import { useInspectorGraph } from "../lib/use-graph";
import { workflowDefinition } from "../lib/workflow-definition-model";
import { GraphFlow } from "./graph/graph-flow";
import { GraphRelationships } from "./graph/graph-relationships";
import { SchemaPanel } from "./schema-panel";

export function GraphDefinitionClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const state = useInspectorGraph();
  const [selected, setSelected] = useState<GraphNode>();
  const definition = useMemo(
    () => (state.source === undefined ? undefined : workflowDefinition(state.source, id)),
    [id, state.source],
  );
  const filtered = useMemo(
    () => (definition === undefined ? undefined : filterGraph(definition.graph, "", "all")),
    [definition],
  );
  const node = definition?.nodes.find((item) => item.id === selected?.label);

  if (state.error && state.source === undefined)
    return (
      <section className="panel graph-state" role="alert">
        The graph API is unavailable.
      </section>
    );
  if (definition === undefined || filtered === undefined)
    return (
      <section className="panel graph-state" role="status">
        {state.loading ? "Loading graph definition…" : "Graph definition not found."}
      </section>
    );
  return (
    <div className="graph-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">GRAPH DEFINITION</p>
          <h1>{definition.id}</h1>
          <p className="lede">Top-to-bottom control flow from START to END.</p>
        </div>
        <Link className="button-link" href="/graphs">
          <ArrowLeft aria-hidden="true" /> All graphs
        </Link>
      </header>
      <section className="graph-summary" aria-label="Graph definition summary">
        <Summary label="Nodes" value={definition.nodeCount} />
        <Summary label="Parallel branches" value={definition.parallelCount} />
        <Summary label="Joins" value={definition.joinCount} />
        <Summary label="Conditional routes" value={definition.conditionalCount} />
        <Summary label="Loops" value={definition.loopCount} />
      </section>
      <section className="panel graph-panel" aria-labelledby="workflow-canvas-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">REACT FLOW</p>
            <h2 id="workflow-canvas-heading">Node graph</h2>
          </div>
          <Badge>START → END</Badge>
        </div>
        <GraphFlow
          graph={definition.graph}
          filtered={filtered}
          direction="DOWN"
          ariaLabel={`${definition.id} node graph`}
          onSelect={setSelected}
        />
      </section>
      <div className="route-contract-grid">
        <SchemaPanel title="Graph input" value={definition.input ?? {}} eyebrow="SAFE SCHEMA" />
        <SchemaPanel title="Graph output" value={definition.output ?? {}} eyebrow="SAFE SCHEMA" />
      </div>
      <SchemaPanel title="Public graph state" value={definition.state} eyebrow="STATE CHANNELS" />
      <GraphRelationships edges={filtered.edges} />
      <OverlayDialog
        placement="right"
        title={selected?.label ?? "Graph node"}
        description="Safe node definition metadata."
        isOpen={selected !== undefined}
        onOpenChange={(open) => !open && setSelected(undefined)}
        trigger={
          <Button className="sr-only" tabIndex={-1}>
            Open node details
          </Button>
        }
      >
        <pre className="safe-json">{JSON.stringify(node ?? selected ?? {}, null, 2)}</pre>
      </OverlayDialog>
    </div>
  );
}

function Summary({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="panel summary-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
