import type { AppNode, ApplicationGraph, GraphNode, ProviderProfileNode } from "@zsys/graph";
import { usedCapabilities } from "./from-graph-aws.js";

export const AWS_DEPLOYMENT_CAPABILITIES = [
  "buckets",
  "cache",
  "events",
  "jobs",
  "models",
  "observability",
] as const;
export type Capability = (typeof AWS_DEPLOYMENT_CAPABILITIES)[number];
type EnvNode = Extract<GraphNode, { kind: "env" }>;

const AWS_ADAPTERS: Readonly<Record<Capability, readonly string[]>> = {
  buckets: ["s3"],
  cache: ["redis"],
  events: ["eventbridge"],
  jobs: ["sqs"],
  models: [],
  observability: ["cloudwatch"],
};

export interface FromGraphOptions {
  readonly image?: import("./plan.js").ContainerImagePlan;
  readonly httpPort?: number;
}

export type DeploymentPlanErrorCode =
  | "ZSYS_DEPLOY_GRAPH_INVALID"
  | "ZSYS_DEPLOY_SECRET_UNSUPPORTED"
  | "ZSYS_DEPLOY_LIVE_OBJECT_UNSUPPORTED"
  | "ZSYS_DEPLOY_AWS_CAPABILITY_UNSUPPORTED"
  | "ZSYS_DEPLOY_AWS_PROFILE_UNSUPPORTED"
  | "ZSYS_DEPLOY_CONFIGURATION_MISSING";

export class DeploymentPlanError extends Error {
  constructor(
    readonly code: DeploymentPlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DeploymentPlanError";
  }
}

export function providerMap(nodes: readonly GraphNode[]): Map<string, ProviderProfileNode> {
  return new Map(
    nodes
      .filter((node): node is ProviderProfileNode => node.kind === "provider")
      .map((node) => [node.id, node]),
  );
}

export function validateProviders(
  app: AppNode,
  providers: Map<string, ProviderProfileNode>,
  nodes: readonly GraphNode[],
  edges: ApplicationGraph["edges"],
): void {
  for (const provider of providers.values()) {
    if (!(AWS_DEPLOYMENT_CAPABILITIES as readonly string[]).includes(provider.capability)) {
      fail(
        "ZSYS_DEPLOY_AWS_CAPABILITY_UNSUPPORTED",
        `AWS does not support capability ${provider.capability}.`,
      );
    }
    if (
      provider.ownership === "managed" &&
      !AWS_ADAPTERS[provider.capability as Capability].includes(provider.adapter)
    ) {
      fail(
        "ZSYS_DEPLOY_AWS_CAPABILITY_UNSUPPORTED",
        `AWS does not support managed ${provider.capability}:${provider.adapter}.`,
      );
    }
  }
  for (const id of app.providerBindings ?? []) {
    if (!providers.has(id)) {
      fail("ZSYS_DEPLOY_AWS_PROFILE_UNSUPPORTED", `Provider binding ${id} is missing.`);
    }
  }
  for (const { capability, profile } of usedCapabilities(nodes, edges)) {
    requireProvider(providers, capability, profile);
  }
}

export function requireProvider(
  providers: Map<string, ProviderProfileNode>,
  capability: Capability,
  profile: string,
): ProviderProfileNode {
  const provider = providers.get(providerId(capability, profile));
  if (provider !== undefined) return provider;
  fail(
    "ZSYS_DEPLOY_AWS_PROFILE_UNSUPPORTED",
    `Provider profile ${profile} does not implement ${capability}.`,
  );
}

export function configNames(
  providers: Map<string, ProviderProfileNode>,
  name: Capability,
  profile: string,
): string[] {
  const provider = requireProvider(providers, name, profile);
  return provider.environment
    .filter((entry) => !entry.sensitive && !secretName(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function isManaged(
  providers: Map<string, ProviderProfileNode>,
  capability: Capability,
  profile: string,
): boolean {
  return requireProvider(providers, capability, profile).ownership === "managed";
}

export function providerId(capability: string, profile: string): string {
  return `provider.${capability}.${profile}`;
}

export function onlyApp(nodes: readonly GraphNode[]): Extract<GraphNode, { kind: "app" }> {
  const apps = nodes.filter(
    (node): node is Extract<GraphNode, { kind: "app" }> => node.kind === "app",
  );
  if (apps.length !== 1)
    fail("ZSYS_DEPLOY_GRAPH_INVALID", "Graph must contain exactly one app node.");
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
