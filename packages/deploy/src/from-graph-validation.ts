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

export interface FromGraphOptions {
  readonly image?: import("./plan.js").ContainerImagePlan;
  readonly modelProfiles?: Readonly<
    Record<string, { readonly provider: string; readonly model?: string }>
  >;
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
      .map((node) => [node.profile, node]),
  );
}

export function validateProviders(
  app: AppNode,
  providers: Map<string, ProviderProfileNode>,
  nodes: readonly GraphNode[],
  edges: ApplicationGraph["edges"],
): void {
  for (const provider of providers.values())
    for (const capability of provider.capabilities)
      if (!(AWS_DEPLOYMENT_CAPABILITIES as readonly string[]).includes(capability))
        fail(
          "ZSYS_DEPLOY_AWS_CAPABILITY_UNSUPPORTED",
          `AWS does not support capability ${capability}.`,
        );
  for (const profile of app.providerProfiles ?? [])
    if (!providers.has(profile))
      fail("ZSYS_DEPLOY_AWS_PROFILE_UNSUPPORTED", `AWS profile ${profile} is missing.`);
  for (const name of usedCapabilities(nodes, edges))
    requireProvider(providers, envNodes(nodes), "default", name);
}

export function requireProvider(
  providers: Map<string, ProviderProfileNode>,
  envs: Map<string, EnvNode>,
  profile: string,
  name: Capability,
): ProviderProfileNode {
  const provider = providers.get(profile);
  if (!provider || !provider.capabilities.includes(name))
    fail(
      "ZSYS_DEPLOY_AWS_PROFILE_UNSUPPORTED",
      `AWS profile ${profile} does not implement ${name}.`,
    );
  const production = config(provider);
  if (!production.includes("region"))
    fail(
      "ZSYS_DEPLOY_CONFIGURATION_MISSING",
      `AWS profile ${profile} lacks ${name} configuration.`,
    );
  for (const env of provider.environment)
    if (!envs.has(env))
      fail(
        "ZSYS_DEPLOY_CONFIGURATION_MISSING",
        `AWS profile ${profile} references missing configuration.`,
      );
  return provider;
}

export function configNames(
  providers: Map<string, ProviderProfileNode>,
  nodes: readonly GraphNode[],
  name: Capability,
  profile: string,
): string[] {
  const provider = requireProvider(providers, envNodes(nodes), profile, name);
  const envs = envNodes(nodes);
  return [
    ...new Set([
      ...config(provider).filter((entry) => !secretName(entry)),
      ...provider.environment.filter((entry) => !envs.get(entry)?.sensitive && !secretName(entry)),
    ]),
  ].sort();
}

function config(provider: ProviderProfileNode): string[] {
  const value = provider.configuration;
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as { readonly production?: unknown })
      : undefined;
  const production = record?.production;
  if (
    !Array.isArray(production) ||
    !production.every((name): name is string => typeof name === "string")
  )
    fail(
      "ZSYS_DEPLOY_CONFIGURATION_MISSING",
      `AWS profile ${provider.profile} has no production configuration.`,
    );
  return [...production];
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
  nodes: readonly GraphNode[],
  kind: K,
): Extract<GraphNode, { kind: K }>[] {
  return nodes.filter((node): node is Extract<GraphNode, { kind: K }> => node.kind === kind);
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
