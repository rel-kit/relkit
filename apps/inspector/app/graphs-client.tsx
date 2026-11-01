"use client";

import {
  ArrowUpRight,
  Circle,
  CircleDot,
  GitBranch,
  Layers,
  Network,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { PageHeader } from "../components/blocks/page-header";
import { EmptyState } from "../components/neon/empty-state";
import { TreeExplorer, type TreeGroup } from "../components/neon/tree-explorer";
import { useInspectorGraph } from "../lib/use-graph";
import { workflowDefinitions, type WorkflowDefinition } from "../lib/workflow-definition-model";
import { ConnectionStatus } from "./overview-shell";

export function GraphsClient() {
  const state = useInspectorGraph();
  const graphs = state.source === undefined ? [] : workflowDefinitions(state.source);
  return (
    <div className="route-page">
      <PageHeader
        title="Agent graphs"
        description="Registered defineGraph state, nodes, branches, joins, loops, and destinations."
        icon={<Workflow />}
        badges={
          graphs.length > 0 ? (
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {graphs.length}
            </span>
          ) : null
        }
        actions={<ConnectionStatus state={state.connection} droppedEvents={state.droppedEvents} />}
      />
      {state.loading && state.source === undefined ? (
        <div className="rounded-lg border border-border bg-card">
          <LoadingRows label="Loading graph definitions…" rows={5} />
        </div>
      ) : state.error && state.source === undefined ? (
        <FailedState title="The graph API is unavailable." />
      ) : graphs.length === 0 ? (
        <EmptyState
          size="lg"
          icon={<Workflow />}
          title="No defineGraph definitions are registered."
          description="Agent graphs describe multi-step agent workflows: nodes, conditional routes, parallel branches, joins and loops. Declare one with defineGraph and it appears here with its node tree."
        />
      ) : (
        <TreeExplorer
          title="Graph definitions"
          subtitle="Active generation · graph → nodes"
          icon={<Network />}
          searchLabel="Filter graphs and nodes"
          defaultOpen={graphs.map((graph) => graph.id)}
          groups={graphs.map(graphGroup)}
        />
      )}
    </div>
  );
}

function graphGroup(graph: WorkflowDefinition): TreeGroup {
  const href = `/graphs/${encodeURIComponent(graph.id)}`;
  return {
    id: graph.id,
    label: graph.id,
    href,
    icon: <Workflow />,
    summary: (
      <>
        {graph.domainId ? (
          <span className="hidden rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] @md:inline">
            {graph.domainId}
          </span>
        ) : null}
        <span className="font-mono text-[10.5px]">
          {graph.nodeCount} nodes · {graph.parallelCount} parallel · {graph.conditionalCount}{" "}
          conditional · {graph.loopCount} loops
        </span>
        <Link
          className="ml-1 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-foreground no-underline hover:bg-muted"
          href={href}
        >
          Open graph
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </Link>
      </>
    ),
    children: graph.graph.nodes.map((node) => ({
      id: `${graph.id}:${node.id}`,
      label: node.label ?? node.id,
      keywords: node.kind,
      icon: nodeIcon(node.kind),
      detail: node.kind,
      href,
    })),
  };
}

function nodeIcon(kind: string) {
  if (kind === "graph-start" || kind === "graph-end") return <CircleDot />;
  if (kind === "subgraph") return <Layers />;
  if (kind.includes("branch") || kind.includes("parallel")) return <GitBranch />;
  return <Circle />;
}
