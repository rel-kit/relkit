import type { JsonValue } from "@relkit/contracts";
import type { AppNode, ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import type {
  AccessOperationPlan,
  ConnectedBindingPlan,
  DeploymentBindingRuntimePlan,
  DeploymentIntegrationPlan,
  InfrastructureOperationPlan,
} from "./plan-integrations.js";
import { fail } from "./from-graph-validation.js";

export function engine(app: AppNode): DeploymentIntegrationPlan<"engine"> {
  return appRole(app, "engine");
}

export function host(app: AppNode): DeploymentIntegrationPlan<"host"> {
  return appRole(app, "host");
}

export function connectedBindings(
  providers: ReadonlyMap<string, ProviderBindingNode>,
  edges: ApplicationGraph["edges"],
): readonly ConnectedBindingPlan[] {
  return requiredProviders(providers, edges)
    .filter((provider) => provider.providerSource.kind === "connected")
    .map((provider) => ({ kind: "connected-binding", ...runtime(provider) }));
}

export function infrastructureOperations(
  providers: ReadonlyMap<string, ProviderBindingNode>,
  edges: ApplicationGraph["edges"],
): readonly InfrastructureOperationPlan[] {
  return requiredProviders(providers, edges)
    .filter((provider) => provider.providerSource.kind === "infrastructure")
    .map((provider) => ({
      kind: "infrastructure-operation",
      id: provider.id,
      ...runtime(provider),
      integration: bindingRole(provider, "infrastructure"),
    }));
}

export function accessOperations(
  providers: ReadonlyMap<string, ProviderBindingNode>,
  edges: ApplicationGraph["edges"],
): readonly AccessOperationPlan[] {
  return requiredProviders(providers, edges).flatMap((provider) => {
    const roles = provider.deploymentRoles.filter((entry) => entry.role === "access");
    if (roles.length === 0) return [];
    if (roles.length !== 1)
      fail("RELKIT_DEPLOY_ROLE_INVALID", `Binding "${provider.id}" has duplicate access roles.`);
    return [
      {
        kind: "access-operation",
        id: `${provider.id}.access`,
        bindingId: provider.id,
        integration: roles[0] as DeploymentIntegrationPlan<"access">,
      },
    ];
  });
}

function appRole<Role extends "engine" | "host">(
  app: AppNode,
  role: Role,
): DeploymentIntegrationPlan<Role> {
  const roles = (app.deploymentRoles ?? []).filter((entry) => entry.role === role);
  if (roles.length !== 1)
    fail(
      roles.length === 0 ? "RELKIT_DEPLOY_ROLE_MISSING" : "RELKIT_DEPLOY_ROLE_INVALID",
      `Deployment requires exactly one ${role} integration.`,
    );
  return roles[0] as DeploymentIntegrationPlan<Role>;
}

function bindingRole<Role extends "infrastructure">(
  provider: ProviderBindingNode,
  role: Role,
): DeploymentIntegrationPlan<Role> {
  const roles = provider.deploymentRoles.filter((entry) => entry.role === role);
  if (roles.length !== 1)
    fail(
      roles.length === 0 ? "RELKIT_DEPLOY_ROLE_MISSING" : "RELKIT_DEPLOY_ROLE_INVALID",
      `Binding "${provider.id}" requires exactly one ${role} integration.`,
    );
  return roles[0] as DeploymentIntegrationPlan<Role>;
}

function requiredProviders(
  providers: ReadonlyMap<string, ProviderBindingNode>,
  edges: ApplicationGraph["edges"],
): ProviderBindingNode[] {
  const required = new Set(
    edges.filter((edge) => edge.kind === "uses-provider-profile").map((edge) => edge.to),
  );
  return [...providers.values()]
    .filter((provider) => required.has(provider.id))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function runtime(provider: ProviderBindingNode): DeploymentBindingRuntimePlan {
  return {
    bindingId: provider.id,
    capability: provider.capability,
    profile: provider.profile,
    adapter: {
      integrationId: provider.adapter.integrationId,
      adapterId: provider.adapter.adapterId,
      protocolVersion: provider.adapter.protocolVersion,
      behavior: provider.adapter.behavior,
      connectionContract: provider.adapter.connectionContract as unknown as JsonValue,
      connection: provider.adapter.connection,
      features: provider.adapter.features,
    },
    namedValues: [...provider.namedValues].sort(
      (left, right) => left.field.localeCompare(right.field) || left.name.localeCompare(right.name),
    ),
  };
}
