import type { InspectorGraph, InspectorObject } from "./api-types";
import { normalizeGraphResponse, type GraphSnapshot } from "./graph-model";

export interface WorkflowDefinition {
  readonly id: string;
  readonly domainId?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly state: readonly InspectorObject[];
  readonly nodes: readonly InspectorObject[];
  readonly source?: InspectorObject;
  readonly graph: GraphSnapshot;
  readonly nodeCount: number;
  readonly conditionalCount: number;
  readonly parallelCount: number;
  readonly joinCount: number;
  readonly loopCount: number;
}

export function workflowDefinitions(payload: InspectorGraph): readonly WorkflowDefinition[] {
  const snapshot = normalizeGraphResponse(payload);
  const root = record(payload.graph) ?? record(payload);
  return records(root?.nodes)
    .filter((node) => node.kind === "agent" && node.execution === "graph")
    .flatMap((node) => {
      const id = text(node.id);
      const workflow = record(node.workflow);
      if (id === undefined || workflow === undefined) return [];
      const graph = workflowSnapshot(snapshot, id);
      const kinds = graph.declaredEdges.map((edge) => edge.kind);
      const client = record(node.clientContract);
      const domainId = text(node.domainId);
      const source = record(node.source);
      return [
        {
          id,
          ...(domainId === undefined ? {} : { domainId }),
          ...(node.input === undefined ? {} : { input: node.input }),
          ...(node.output === undefined ? {} : { output: node.output }),
          state: records(client?.state),
          nodes: records(workflow.nodes),
          ...(source === undefined ? {} : { source }),
          graph,
          nodeCount: graph.nodes.filter(
            (item) => item.kind === "graph-node" || item.kind === "subgraph",
          ).length,
          conditionalCount: kinds.filter((kind) => kind.startsWith("conditional:")).length,
          parallelCount: kinds.filter((kind) => kind === "parallel").length,
          joinCount: kinds.filter((kind) => kind === "join").length,
          loopCount: kinds.filter((kind) => kind === "loop" || kind.endsWith(":loop")).length,
        },
      ];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function workflowDefinition(
  payload: InspectorGraph,
  id: string,
): WorkflowDefinition | undefined {
  return workflowDefinitions(payload).find((item) => item.id === id);
}

function workflowSnapshot(graph: GraphSnapshot, id: string): GraphSnapshot {
  const nodes = graph.nodes.filter((node) => node.parentId === id && isWorkflowNode(node.kind));
  const visible = new Set(nodes.map((node) => node.id));
  return {
    ...graph,
    nodes,
    declaredEdges: graph.declaredEdges.filter(
      (edge) => visible.has(edge.from) && visible.has(edge.to),
    ),
    observedEdges: graph.observedEdges.filter(
      (edge) => visible.has(edge.from) && visible.has(edge.to),
    ),
  };
}

function isWorkflowNode(kind: string): boolean {
  return (
    kind === "graph-start" ||
    kind === "graph-end" ||
    kind === "graph-node" ||
    kind === "graph-dynamic" ||
    kind === "subgraph"
  );
}

function records(value: unknown): readonly InspectorObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function record(value: unknown): InspectorObject | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
