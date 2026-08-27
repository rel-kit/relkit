import type { ApplicationGraph, GraphNode, ProviderProfileNode } from "@relkit/graph";
import { logicalName } from "./from-graph-validation.js";
import type {
  DeploymentFunctionCapability,
  DeploymentIamPlan,
  DeploymentIamStatement,
} from "./plan.js";

const ACTIONS = {
  bucket: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
  cache: ["elasticache:Connect"],
  eventPublish: ["events:PutEvents"],
  jobConsume: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility"],
  eventConsume: [
    "sqs:ReceiveMessage",
    "sqs:DeleteMessage",
    "sqs:ChangeMessageVisibility",
    "sqs:GetQueueAttributes",
  ],
  jobPublish: ["sqs:SendMessage"],
} as const;

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
  providers: ReadonlyMap<string, ProviderProfileNode>,
): DeploymentIamPlan {
  const grants = new Map<string, Grant>();
  const managedResources = new Set(
    graph.edges.flatMap((edge) => {
      if (edge.kind !== "uses-provider-profile") return [];
      return providers.get(edge.to)?.ownership === "managed" ? [edge.from] : [];
    }),
  );
  const functionIds = new Set(
    graph.nodes.filter((node) => node.kind === "function").map((node) => node.id),
  );
  const add = (
    functionId: string,
    capability: string,
    resourceId: string,
    kind: string,
    actions: readonly string[],
  ): void => {
    if (actions.length === 0 || !managedResources.has(resourceId)) return;
    const resource = logicalName(appId, kind, resourceId);
    const key = [functionId, capability, resourceId, actions.join(",")].join("\0");
    grants.set(key, { functionId, capability, resourceId, resource, actions });
  };

  for (const edge of graph.edges) {
    if (!functionIds.has(edge.from)) continue;
    if (edge.kind === "uses-bucket") add(edge.from, "buckets", edge.to, "bucket", ACTIONS.bucket);
    if (edge.kind === "uses-cache") add(edge.from, "cache", edge.to, "cache", ACTIONS.cache);
    if (edge.kind === "enqueues-job") add(edge.from, "jobs", edge.to, "job", ACTIONS.jobPublish);
    if (edge.kind === "publishes-event")
      add(edge.from, "events", edge.to, "event", ACTIONS.eventPublish);
  }

  for (const node of graph.nodes) {
    if (node.kind === "job") add(node.targetFunctionId, "jobs", node.id, "job", ACTIONS.jobConsume);
    if (
      node.kind === "trigger" &&
      node.triggerType === "event" &&
      isRecord(node.config) &&
      node.config.delivery === "durable"
    )
      add(node.targetFunctionId, "jobs", node.id, "event-trigger", ACTIONS.eventConsume);
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
