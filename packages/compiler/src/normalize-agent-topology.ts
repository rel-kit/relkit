import type {
  AgentResourceDependency,
  AgentSubagentTopology,
  AgentWorkflowTopology,
} from "@relkit/graph";
import { isRecord, refId, refKind } from "./normalize-utils.js";

/**
 * Projects declared subagent references and invocation policies.
 * @param value - Declared metadata inspected without coercion.
 * @returns Declared subagent references and invocation policies, or undefined.
 */
export function agentSubagents(value: unknown): readonly AgentSubagentTopology[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return [];
    return [{ id: entry.id, subagents: agentSubagents(entry.subagents) ?? [] }];
  });
}

/**
 * Projects agent resource policies and selected provider profiles.
 * @param value - Declared metadata inspected without coercion.
 * @param modelProfile - Selected model provider profile.
 * @param stateProfile - Selected agent state provider profile.
 * @returns Resource access policies and selected provider profiles.
 */
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

/**
 * Projects workflow stages, routes, and graph reachability.
 * @param value - Declared metadata inspected without coercion.
 * @returns The workflow's stage, route, and reachability projection, or undefined.
 */
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

/**
 * Appends a selected persistence resource to agent graph metadata.
 * @param output - Generated output filename.
 * @param kind - Descriptor or syntax category.
 * @param value - Declared metadata inspected without coercion.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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

/**
 * Projects workflow edges into portable graph links.
 * @param edges - Declared workflow or graph edges.
 * @returns Portable from/to workflow links.
 */
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

/**
 * Selects workflow route names from declared metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns Declared workflow route labels and targets.
 */
function routeList(value: readonly unknown[]): { label: string; to: string }[] {
  return value.flatMap((route) =>
    isRecord(route) && typeof route.label === "string" && typeof route.to === "string"
      ? [{ label: route.label, to: route.to }]
      : [],
  );
}

/**
 * Checks directed workflow reachability with cycle detection.
 * @param start - Starting workflow vertex.
 * @param target - Target contract or metadata being checked.
 * @param outgoing - Directed graph adjacency index.
 * @returns True when the workflow graph has a path between the selected stages.
 */
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
