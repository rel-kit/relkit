import type { ApplicationGraph, ProviderProfileNode } from "@zsys/graph";
import type { DeploymentCapabilityPlan } from "./plan.js";
import type { Capability } from "./from-graph-validation.js";
import { configNames, logicalName, providerId } from "./from-graph-validation.js";

export interface PlanContext {
  readonly appId: string;
  readonly graphHash: string;
  readonly graph: ApplicationGraph;
  readonly providers: Map<string, ProviderProfileNode>;
}

export function base(
  context: PlanContext,
  id: string,
  kind: string,
  name: Capability,
  profile: string,
  actions: readonly string[] = [],
): DeploymentCapabilityPlan {
  return {
    id,
    logicalName: logicalName(context.appId, kind, id),
    bindingId: providerId(name, profile),
    profile,
    configurationNames: configNames(context.providers, name, profile),
    capabilities: [name],
    tags: { app: context.appId, graphHash: context.graphHash, "managed-by": "zsys" },
    ...(actions.length === 0 ? {} : { metadata: { iamCapabilities: actions } }),
  };
}
