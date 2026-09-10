import type { GraphEdge, GraphNode } from "./graph-model";
import { readAgentTools } from "./graph-agent-tools";

export function readAgentTopology(value: readonly unknown[]): {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const item of value) {
    const agent = record(item);
    if (agent?.kind !== "agent" || typeof agent.id !== "string") continue;
    const topology = record(agent.workflowTopology);
    if (topology !== undefined) addWorkflow(agent.id, topology, agent.workflow, nodes, edges);
    addSubagents(agent.id, agent.subagents, nodes, edges);
    addResources(agent.id, agent.resourceDependencies, nodes, edges);
    const tools = readAgentTools(agent.id, agent, value);
    nodes.push(...tools.nodes);
    edges.push(...tools.edges);
  }
  return { nodes: uniqueNodes(nodes), edges: uniqueEdges(edges) };
}
function addWorkflow(
  agentId: string,
  topology: Record<string, unknown>,
  workflow: unknown,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  const start = text(topology.start);
  const end = text(topology.end);
  if (start === undefined || end === undefined) return;
  const subgraphs = new Set(strings(topology.subgraphs));
  const registered = strings(topology.registeredNodes);
  const dynamic = strings(topology.dynamicRoutes);
  nodes.push(workflowNode(agentId, start, "graph-start"), workflowNode(agentId, end, "graph-end"));
  nodes.push(
    ...registered.map((id) =>
      workflowNode(agentId, id, subgraphs.has(id) ? "subgraph" : "graph-node"),
    ),
    ...dynamic.map((id) => workflowNode(agentId, `dynamic:${id}`, "graph-dynamic")),
  );
  edges.push(edge(agentId, workflowNodeId(agentId, start), "contains-workflow"));
  const loopKeys = new Set(routePairs(topology.loops).map(pairKey));
  const parallelKeys = new Set(
    records(topology.parallelBranches).flatMap((branch) =>
      text(branch.from) === undefined
        ? []
        : strings(branch.to).map((to) => pairKey({ from: text(branch.from)!, to })),
    ),
  );
  const workflowEdges = records(record(workflow)?.edges);
  for (const item of workflowEdges) {
    if (item.kind === "edge")
      addRoute(agentId, item.from, item.to, routeKind(item, loopKeys, parallelKeys), edges);
    if (item.kind === "join")
      for (const from of strings(item.from)) addRoute(agentId, from, item.to, "join", edges);
  }
  for (const route of records(topology.conditionalRoutes)) {
    for (const destination of records(route.routes)) {
      const from = text(route.from) ?? "";
      const to = text(destination.to) ?? "";
      const label = text(destination.label) ?? "route";
      addRoute(
        agentId,
        route.from,
        destination.to,
        loopKeys.has(pairKey({ from, to })) ? `conditional:${label}:loop` : `conditional:${label}`,
        edges,
      );
    }
  }
  for (const branch of records(topology.parallelBranches)) {
    for (const to of strings(branch.to)) addRoute(agentId, branch.from, to, "parallel", edges);
  }
  for (const join of records(topology.joins)) {
    for (const from of strings(join.from)) addRoute(agentId, from, join.to, "join", edges);
  }
  for (const loop of routePairs(topology.loops)) {
    const source = workflowNodeId(agentId, loop.from);
    const target = workflowNodeId(agentId, loop.to);
    if (!edges.some((item) => item.from === source && item.to === target))
      addRoute(agentId, loop.from, loop.to, "loop", edges);
  }
  for (const node of records(record(workflow)?.nodes)) {
    const from = text(node.id);
    if (from === undefined) continue;
    for (const to of strings(node.ends)) addRoute(agentId, from, to, "command", edges);
  }
  for (const from of dynamic)
    addRoute(agentId, from, `dynamic:${from}`, "conditional:dynamic", edges);
}
function addSubagents(
  parentId: string,
  value: unknown,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  for (const item of records(value)) {
    const child = text(item.id);
    if (child === undefined) continue;
    const childId = `${parentId}::subagent::${encodeURIComponent(child)}`;
    nodes.push({ id: childId, kind: "subagent", parentId, label: child });
    edges.push(edge(parentId, childId, "delegates-to"));
    addSubagents(childId, item.subagents, nodes, edges);
  }
}
function addResources(
  agentId: string,
  value: unknown,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  records(value).forEach((item, index) => {
    const kind = text(item.kind);
    if (kind === undefined) return;
    const label = text(item.id) ?? text(item.profile) ?? `${kind} ${index + 1}`;
    const resourceId = `${agentId}::resource::${kind}:${encodeURIComponent(label)}`;
    nodes.push({ id: resourceId, kind: `resource-${kind}`, parentId: agentId, label });
    edges.push(edge(resourceId, agentId, "provides-resource"));
  });
}
function workflowNode(agentId: string, label: string, kind: string): GraphNode {
  const display = kind === "graph-start" ? "START" : kind === "graph-end" ? "END" : label;
  return { id: workflowNodeId(agentId, label), kind, parentId: agentId, label: display };
}
function addRoute(
  agentId: string,
  from: unknown,
  to: unknown,
  kind: string,
  output: GraphEdge[],
): void {
  const source = text(from);
  const target = text(to);
  if (source !== undefined && target !== undefined)
    output.push(edge(workflowNodeId(agentId, source), workflowNodeId(agentId, target), kind));
}

function routeKind(
  route: Record<string, unknown>,
  loops: ReadonlySet<string>,
  parallel: ReadonlySet<string>,
): string {
  const pair = { from: text(route.from) ?? "", to: text(route.to) ?? "" };
  return loops.has(pairKey(pair)) ? "loop" : parallel.has(pairKey(pair)) ? "parallel" : "next";
}

function routePairs(value: unknown): { from: string; to: string }[] {
  return records(value).flatMap((item) => {
    const from = text(item.from);
    const to = text(item.to);
    return from === undefined || to === undefined ? [] : [{ from, to }];
  });
}

function edge(from: string, to: string, kind: string): GraphEdge {
  return { relationship: "declared", from, to, kind };
}

export function workflowNodeId(agentId: string, value: string): string {
  return `${agentId}::workflow::${encodeURIComponent(value)}`;
}

function pairKey(value: { from: string; to: string }): string {
  return `${value.from}\0${value.to}`;
}

function uniqueNodes(nodes: readonly GraphNode[]): readonly GraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function uniqueEdges(edges: readonly GraphEdge[]): readonly GraphEdge[] {
  return [
    ...new Map(edges.map((item) => [`${item.from}\0${item.to}\0${item.kind}`, item])).values(),
  ];
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

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
