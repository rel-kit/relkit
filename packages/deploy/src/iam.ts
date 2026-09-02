import type { ApplicationGraph, GraphNode, ProviderBindingNode } from "@relkit/graph";
import { logicalName } from "./from-graph-validation.js";
import type {
  DeploymentFunctionCapability,
  DeploymentIamPlan,
  DeploymentIamStatement,
} from "./plan.js";
import { accessActions } from "./from-graph-providers.js";

interface Grant {
  readonly functionId: string;
  readonly capability: string;
  readonly resourceId: string;
  readonly resource: string;
  readonly actions: readonly string[];
}

/** Builds edge-derived shared-role policy data and future per-function grants. */
export function createIamPlan(
  appId: string,
  graph: ApplicationGraph,
  providers: ReadonlyMap<string, ProviderBindingNode>,
): DeploymentIamPlan {
  const grants = new Map<string, Grant>();
  const resourceProviders = new Map(
    graph.edges.flatMap((edge) =>
      edge.kind === "uses-provider-profile" && providers.has(edge.to)
        ? [[edge.from, providers.get(edge.to)!] as const]
        : [],
    ),
  );
  const functionIds = new Set(
    graph.nodes.filter((node) => node.kind === "function").map((node) => node.id),
  );
  const add = (functionId: string, resourceId: string): void => {
    const provider = resourceProviders.get(resourceId);
    if (provider === undefined) return;
    const actions = accessActions(provider);
    if (actions.length === 0) return;
    const capability = provider.capability;
    const resource = logicalName(appId, capability, resourceId);
    const key = [functionId, capability, resourceId, actions.join(",")].join("\0");
    grants.set(key, { functionId, capability, resourceId, resource, actions });
  };

  for (const edge of graph.edges) {
    if (!functionIds.has(edge.from)) continue;
    if (
      edge.kind === "uses-bucket" ||
      edge.kind === "uses-cache" ||
      edge.kind === "enqueues-job" ||
      edge.kind === "publishes-event"
    )
      add(edge.from, edge.to);
  }

  for (const node of graph.nodes) {
    if (node.kind === "job") add(node.targetFunctionId, node.id);
    if (
      node.kind === "trigger" &&
      node.triggerType === "event" &&
      isRecord(node.config) &&
      node.config.delivery === "durable"
    )
      add(node.targetFunctionId, node.id);
  }

  const perFunction = [...grants.values()]
    .sort(compareGrants)
    .map(({ functionId, capability, resourceId, actions }): DeploymentFunctionCapability => ({
      functionId,
      capability,
      resourceId,
      actions: [...actions],
    }));
  return {
    serviceRole: { statements: statements([...grants.values()]) },
    perFunction,
  };
}

function statements(grants: readonly Grant[]): DeploymentIamStatement[] {
  const grouped = new Map<
    string,
    { capability: string; actions: readonly string[]; resources: Set<string> }
  >();
  for (const grant of grants) {
    const key = `${grant.capability}\0${grant.actions.join(",")}`;
    const current = grouped.get(key) ?? {
      capability: grant.capability,
      actions: grant.actions,
      resources: new Set<string>(),
    };
    current.resources.add(grant.resource);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(({ capability, actions, resources }) => ({
      capability,
      actions: [...actions],
      resources: [...resources].sort(),
    }))
    .sort(
      (left, right) =>
        left.capability.localeCompare(right.capability) ||
        left.actions.join(",").localeCompare(right.actions.join(",")) ||
        left.resources.join(",").localeCompare(right.resources.join(",")),
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareGrants(left: Grant, right: Grant): number {
  return (
    left.functionId.localeCompare(right.functionId) ||
    left.capability.localeCompare(right.capability) ||
    left.resourceId.localeCompare(right.resourceId) ||
    left.actions.join(",").localeCompare(right.actions.join(","))
  );
}
