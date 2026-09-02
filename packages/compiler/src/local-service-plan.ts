import {
  LOCAL_SERVICE_PLAN_VERSION,
  type LocalServicePlan,
  type LocalServicePlanEntry,
} from "@relkit/local-service";

interface LocalServiceGraph {
  readonly nodes: readonly { readonly kind: string; readonly id: string }[];
  readonly edges: readonly { readonly kind: string; readonly from: string; readonly to: string }[];
}

interface LocalProviderNode {
  readonly kind: "provider";
  readonly id: string;
  readonly capability: string;
  readonly profile: string;
  readonly local: {
    readonly integrationId: string;
    readonly recipeId: string;
    readonly recipeVersion: number;
  };
}

export function generateLocalServicePlan(
  graph: LocalServiceGraph,
  graphHash: string,
): LocalServicePlan {
  const requirements = requiredBy(graph);
  const services = graph.nodes
    .filter(isLocalProvider)
    .map((node) => service(node, requirements.get(node.id) ?? []))
    .sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  return Object.freeze({
    version: LOCAL_SERVICE_PLAN_VERSION,
    graphHash,
    services: Object.freeze(services.map((entry) => Object.freeze(entry))),
  });
}

function service(node: LocalProviderNode, requiredBy: readonly string[]): LocalServicePlanEntry {
  return {
    bindingId: node.id,
    capability: node.capability,
    profile: node.profile,
    materializerId: "docker",
    recipe: Object.freeze({ ...node.local }),
    configuration: Object.freeze({}),
    requiredBy: Object.freeze([...requiredBy]),
  };
}

function requiredBy(graph: LocalServiceGraph): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "uses-provider-profile") continue;
    const values = result.get(edge.to) ?? new Set<string>();
    values.add(edge.from);
    result.set(edge.to, values);
  }
  return new Map(
    [...result].map(([bindingId, values]) => [bindingId, Object.freeze([...values].sort())]),
  );
}

function isLocalProvider(node: LocalServiceGraph["nodes"][number]): node is LocalProviderNode {
  if (node.kind !== "provider") return false;
  const value = node as unknown as Record<string, unknown>;
  const local = value.local as Record<string, unknown> | undefined;
  return (
    typeof value.capability === "string" &&
    typeof value.profile === "string" &&
    local !== undefined &&
    typeof local.integrationId === "string" &&
    typeof local.recipeId === "string" &&
    typeof local.recipeVersion === "number"
  );
}
