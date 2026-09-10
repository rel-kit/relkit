import type {
  AgentResourceDependency,
  AgentSubagentTopology,
  AgentWorkflowTopology,
} from "@relkit/graph";
import { isRecord, refId, refKind } from "./normalize-utils.js";

export function agentSubagents(value: unknown): readonly AgentSubagentTopology[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return [];
    return [{ id: entry.id, subagents: agentSubagents(entry.subagents) ?? [] }];
  });
}

export function agentResources(
  value: Record<string, unknown>,
  modelProfile: string,
  stateProfile: string | undefined,
): readonly AgentResourceDependency[] {
  const resources: AgentResourceDependency[] = [];
  if (value.execution !== "graph") {
    resources.push(
      value.model !== undefined && typeof value.model !== "string"
        ? { kind: "model" }
        : { kind: "model", profile: modelProfile },
    );
  }
  if (stateProfile !== undefined) resources.push({ kind: "agent-state", profile: stateProfile });
  const bucketId = refKind(value.backend) === "bucket" ? refId(value.backend) : undefined;
  if (bucketId !== undefined) resources.push({ kind: "bucket", id: bucketId });
  addPersistence(resources, "checkpointer", value.checkpointer);
  addPersistence(resources, "memory", value.store);
  if (Array.isArray(value.skills)) resources.push({ kind: "skills", count: value.skills.length });
  if (Array.isArray(value.memory))
    resources.push({ kind: "memory-files", count: value.memory.length });
  return resources;
}

export function workflowTopology(value: unknown): AgentWorkflowTopology | undefined {
  if (!isRecord(value) || typeof value.start !== "string" || typeof value.end !== "string") {
    return undefined;
  }
  const nodes = Array.isArray(value.nodes) ? value.nodes.filter(isRecord) : [];
  const edges = Array.isArray(value.edges) ? value.edges.filter(isRecord) : [];
  const links = edgeLinks(edges);
  const outgoing = new Map<string, Set<string>>();
  for (const link of links) {
    const targets = outgoing.get(link.from) ?? new Set<string>();
    targets.add(link.to);
    outgoing.set(link.from, targets);
  }
  const directOutgoing = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind !== "edge" || typeof edge.from !== "string" || typeof edge.to !== "string") {
      continue;
    }
    const targets = directOutgoing.get(edge.from) ?? new Set<string>();
    targets.add(edge.to);
    directOutgoing.set(edge.from, targets);
  }
  return {
    start: value.start,
    end: value.end,
    registeredNodes: nodes.flatMap((node) => (typeof node.id === "string" ? [node.id] : [])),
    conditionalRoutes: edges.flatMap((edge) =>
      edge.kind === "conditional" && typeof edge.from === "string" && Array.isArray(edge.routes)
        ? [{ from: edge.from, routes: routeList(edge.routes) }]
        : [],
    ),
    dynamicRoutes: edges.flatMap((edge) =>
      edge.kind === "conditional" && edge.dynamic === true && typeof edge.from === "string"
        ? [edge.from]
        : [],
    ),
    parallelBranches: [...directOutgoing].flatMap(([from, targets]) =>
      targets.size > 1 ? [{ from, to: [...targets] }] : [],
    ),
    joins: edges.flatMap((edge) =>
      edge.kind === "join" && Array.isArray(edge.from) && typeof edge.to === "string"
        ? [
            {
              from: edge.from.filter((item): item is string => typeof item === "string"),
              to: edge.to,
            },
          ]
        : [],
    ),
    loops: links.filter((link) => reachable(link.to, link.from, outgoing)),
    subgraphs: nodes.flatMap((node) =>
      node.kind === "subgraph" && typeof node.id === "string" ? [node.id] : [],
    ),
  };
}

function addPersistence(
  output: AgentResourceDependency[],
  kind: "checkpointer" | "memory",
  value: unknown,
): void {
  if (value === undefined) return;
  output.push({
    kind,
    ...(isRecord(value) && typeof value.id === "string" ? { id: value.id } : {}),
    ...(isRecord(value) && (value.ownership === "owned" || value.ownership === "borrowed")
      ? { ownership: value.ownership }
      : { ownership: "borrowed" }),
  });
}

function edgeLinks(edges: readonly Record<string, unknown>[]): { from: string; to: string }[] {
  return edges.flatMap((edge) => {
    if (edge.kind === "edge" && typeof edge.from === "string" && typeof edge.to === "string")
      return [{ from: edge.from, to: edge.to }];
    if (edge.kind === "join" && Array.isArray(edge.from) && typeof edge.to === "string")
      return edge.from.flatMap((from) =>
        typeof from === "string" ? [{ from, to: edge.to as string }] : [],
      );
    return edge.kind === "conditional" &&
      typeof edge.from === "string" &&
      Array.isArray(edge.routes)
      ? routeList(edge.routes).map((route) => ({ from: edge.from as string, to: route.to }))
      : [];
  });
}

function routeList(value: readonly unknown[]): { label: string; to: string }[] {
  return value.flatMap((route) =>
    isRecord(route) && typeof route.label === "string" && typeof route.to === "string"
      ? [{ label: route.label, to: route.to }]
      : [],
  );
}

function reachable(
  start: string,
  target: string,
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const pending = [start];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next === target) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...(outgoing.get(next) ?? []));
  }
  return false;
}
