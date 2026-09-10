import type { GraphEdge, GraphNode } from "./graph-model";

export function readAgentTools(
  agentId: string,
  agent: Record<string, unknown>,
  graphNodes: readonly unknown[],
): { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] } {
  const declared = new Set(
    graphNodes.flatMap((value) => {
      const node = record(value);
      return node?.kind === "tool" && typeof node.id === "string" ? [node.id] : [];
    }),
  );
  const contract = record(agent.clientContract);
  const ids = new Set([
    ...strings(agent.toolIds),
    ...records(contract?.tools).flatMap((tool) => (typeof tool.id === "string" ? [tool.id] : [])),
  ]);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const id of ids) {
    if (declared.has(id)) continue;
    const nodeId = `${agentId}::tool::${encodeURIComponent(id)}`;
    nodes.push({ id: nodeId, kind: "tool", parentId: agentId, label: id });
    edges.push({ relationship: "declared", from: agentId, to: nodeId, kind: "uses-tool" });
  }
  return { nodes, edges };
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
