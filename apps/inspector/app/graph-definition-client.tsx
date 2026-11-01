"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Workflow } from "lucide-react";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { CodeBlock } from "../components/blocks/code-block";
import { Section } from "../components/blocks/section";
import { Stat, StatGroup } from "../components/blocks/stat";
import { EmptyState } from "../components/neon/empty-state";
import { Button } from "../components/ui/button";
import { OverlayDialog } from "../components/ui/dialog";
import { filterGraph } from "../lib/graph-filter";
import type { GraphNode } from "../lib/graph-model";
import { useInspectorGraph } from "../lib/use-graph";
import { workflowDefinition } from "../lib/workflow-definition-model";
import { DetailLayout } from "./detail-layout";
import { GraphFlow } from "./graph/graph-flow";
import { GraphRelationships } from "./graph/graph-relationships";
import { SourceLink } from "./source-link";

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
      <div className="route-page">
        <FailedState title="The graph API is unavailable." />
      </div>
    );
  if (definition === undefined || filtered === undefined)
    return state.loading ? (
      <div className="route-page rounded-lg border border-border bg-card">
        <LoadingRows label="Loading graph definition…" rows={6} />
      </div>
    ) : (
      <div className="route-page">
        <EmptyState
          icon={<Workflow />}
          title="Graph definition not found."
          description={`No defineGraph definition named “${id}” is registered in the active generation.`}
          action={
            <Link href="/graphs" className="text-xs text-foreground">
              All graphs
            </Link>
          }
        />
      </div>
    );
  return (
    <DetailLayout
      header={{
        kicker: "Graph definition",
        title: definition.id,
        icon: <Workflow />,
        description: "Top-to-bottom control flow from START to END.",
        meta: (
          <>
            {definition.domainId ? <span>{definition.domainId}</span> : null}
            {definition.source ? <SourceLink source={definition.source} /> : null}
          </>
        ),
        actions: (
          <Link
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-foreground no-underline hover:bg-muted"
            href="/graphs"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" /> All graphs
          </Link>
        ),
      }}
    >
      <section aria-label="Graph definition summary">
        <StatGroup>
          <Stat label="Nodes" value={definition.nodeCount} />
          <Stat label="Parallel branches" value={definition.parallelCount} />
          <Stat label="Joins" value={definition.joinCount} />
          <Stat label="Conditional routes" value={definition.conditionalCount} />
          <Stat label="Loops" value={definition.loopCount} />
        </StatGroup>
      </section>
      <Section
        title={<span id="workflow-canvas-heading">Node graph</span>}
        aria-labelledby="workflow-canvas-heading"
        className="graph-panel"
        description="Select a node to inspect its safe definition"
        actions={
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            START → END
          </span>
        }
        flush
      >
        <div className="p-2 [&_.react-flow-panel]:mt-0">
          <GraphFlow
            graph={definition.graph}
            filtered={filtered}
            direction="DOWN"
            ariaLabel={`${definition.id} node graph`}
            onSelect={setSelected}
          />
        </div>
      </Section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="Graph input">
          <CodeBlock value={definition.input ?? {}} label="graph input" maxHeight="18rem" />
        </Section>
        <Section title="Graph output">
          <CodeBlock value={definition.output ?? {}} label="graph output" maxHeight="18rem" />
        </Section>
      </div>
      <Section title="Public graph state" description="State channels">
        <CodeBlock value={definition.state} label="graph state" maxHeight="18rem" />
      </Section>
      <GraphRelationships edges={filtered.edges} />
      <OverlayDialog
        placement="right"
        title={selected?.label ?? "Graph node"}
        description="Safe node definition metadata."
        isOpen={selected !== undefined}
        onOpenChange={(open) => !open && setSelected(undefined)}
        trigger={
          <Button className="sr-only" isDisabled>
            Open node details
          </Button>
        }
      >
        <CodeBlock value={node ?? selected ?? {}} label="node definition" maxHeight="70vh" />
      </OverlayDialog>
    </DetailLayout>
  );
}
