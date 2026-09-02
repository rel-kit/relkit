import type {
  ApplicationGraph,
  GraphNode,
  ProviderBindingNode,
  ProviderCapability,
} from "@relkit/graph";
import { usedCapabilities } from "./from-graph-providers.js";
type EnvNode = Extract<GraphNode, { kind: "env" }>;

export interface FromGraphOptions {
  readonly image?: import("./plan.js").ContainerImagePlan;
  readonly httpPort?: number;
}

export type DeploymentPlanErrorCode =
  | "RELKIT_DEPLOY_GRAPH_INVALID"
  | "RELKIT_DEPLOY_GRAPH_VERSION_UNSUPPORTED"
  | "RELKIT_DEPLOY_SECRET_UNSUPPORTED"
  | "RELKIT_DEPLOY_LIVE_OBJECT_UNSUPPORTED"
  | "RELKIT_DEPLOY_PROFILE_UNSUPPORTED"
  | "RELKIT_DEPLOY_ROLE_MISSING"
  | "RELKIT_DEPLOY_ROLE_INVALID"
  | "RELKIT_DEPLOY_CONFIGURATION_MISSING";

export class DeploymentPlanError extends Error {
  constructor(
    readonly code: DeploymentPlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DeploymentPlanError";
  }
}

export function providerMap(nodes: readonly GraphNode[]): Map<string, ProviderBindingNode> {
  return new Map(
    nodes
      .filter((node): node is ProviderBindingNode => node.kind === "provider")
      .map((node) => [node.id, node]),
  );
}

export function validateProviders(
  providers: Map<string, ProviderBindingNode>,
  nodes: readonly GraphNode[],
  edges: ApplicationGraph["edges"],
): void {
  for (const { capability, profile } of usedCapabilities(nodes, edges)) {
    requireProvider(providers, capability, profile);
  }
}

export function requireProvider(
  providers: Map<string, ProviderBindingNode>,
  capability: ProviderCapability,
  profile: string,
): ProviderBindingNode {
  const provider = providers.get(providerId(capability, profile));
  if (provider !== undefined) return provider;
  fail(
    "RELKIT_DEPLOY_PROFILE_UNSUPPORTED",
    `Provider profile ${profile} does not implement ${capability}.`,
  );
}

export function configNames(
  providers: Map<string, ProviderBindingNode>,
  name: ProviderCapability,
  profile: string,
): string[] {
  const provider = requireProvider(providers, name, profile);
  return provider.namedValues
    .filter((entry) => !entry.sensitive && !secretName(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function isManaged(
  providers: Map<string, ProviderBindingNode>,
  capability: ProviderCapability,
  profile: string,
): boolean {
  return requireProvider(providers, capability, profile).providerSource.kind === "infrastructure";
}

export function providerId(capability: string, profile: string): string {
  return `provider.${capability}.${profile}`;
}

export function onlyApp(nodes: readonly GraphNode[]): Extract<GraphNode, { kind: "app" }> {
  const apps = nodes.filter(
    (node): node is Extract<GraphNode, { kind: "app" }> => node.kind === "app",
  );
  if (apps.length !== 1)
    fail("RELKIT_DEPLOY_GRAPH_INVALID", "Graph must contain exactly one app node.");
  return apps[0]!;
}

export function nodes<K extends GraphNode["kind"]>(
  values: readonly GraphNode[],
  kind: K,
): Extract<GraphNode, { kind: K }>[] {
  return values.filter((node): node is Extract<GraphNode, { kind: K }> => node.kind === kind);
}

export function envNodes(nodes: readonly GraphNode[]): Map<string, EnvNode> {
  return new Map(
    nodes.filter((node): node is EnvNode => node.kind === "env").map((node) => [node.name, node]),
  );
}

export function envNames(nodes: readonly GraphNode[]): string[] {
  return [...envNodes(nodes).values()]
    .filter((node) => !node.sensitive && !secretName(node.name))
    .map((node) => node.name)
    .sort();
}

export function logicalName(appId: string, kind: string, id: string): string {
  return [appId, kind, id]
    .map(
      (value) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "resource",
    )
    .join("-");
}

export function byLogical(
  left: { readonly logicalName: string },
  right: { readonly logicalName: string },
): number {
  return left.logicalName.localeCompare(right.logicalName);
}

export function secretName(value: string): boolean {
  return /api[-_]?key|password|secret(value)?|private[-_]?key|access[-_]?key|credential/i.test(
    value,
  );
}

export function fail(code: DeploymentPlanErrorCode, message: string): never {
  throw new DeploymentPlanError(code, message);
}
