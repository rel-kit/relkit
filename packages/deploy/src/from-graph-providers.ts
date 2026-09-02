import type {
  ApplicationGraph,
  GraphNode,
  ProviderBindingNode,
  ProviderCapability,
} from "@relkit/graph";

export function usedCapabilities(
  nodes: readonly GraphNode[],
  edges: ApplicationGraph["edges"],
): readonly { readonly capability: ProviderCapability; readonly profile: string }[] {
  const used = new Map<
    string,
    { readonly capability: ProviderCapability; readonly profile: string }
  >();
  const add = (capability: ProviderCapability, profile = "default") => {
    used.set(`${capability}\0${profile}`, { capability, profile });
  };
  for (const node of nodes) {
    if (node.kind === "job") add("job", node.profile);
    if (node.kind === "bucket") add("bucket", node.profile);
    if (node.kind === "cache") add("cache", node.profile);
    if (node.kind === "event") add("event", node.profile);
    if (node.kind === "agent") add("model", node.profile);
    if (node.kind === "trigger" && node.triggerType === "event") add("event", eventProfile(node));
    if (
      node.kind === "trigger" &&
      (node.triggerType === "queue" || node.triggerType === "schedule")
    )
      add("job");
  }
  for (const edge of edges)
    if (edge.kind === "publishes-event" || edge.kind === "listens-to-event") add("event");
  return [...used.values()];
}

export function accessActions(provider: ProviderBindingNode): readonly string[] {
  if (provider.providerSource.kind !== "infrastructure") return [];
  const role = provider.deploymentRoles.find((entry) => entry.role === "access");
  const configuration = record(role?.configuration);
  const actions = configuration?.actions;
  if (!Array.isArray(actions) || actions.some((entry) => typeof entry !== "string")) return [];
  return [...new Set(actions)].sort();
}

function eventProfile(node: Extract<GraphNode, { kind: "trigger" }>): string {
  const config = record(node.config);
  return typeof config?.profile === "string" ? config.profile : "default";
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
