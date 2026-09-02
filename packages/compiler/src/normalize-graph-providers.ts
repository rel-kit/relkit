import type {
  DeploymentRoleProjection,
  ProviderAdapterProjection,
  ProviderBindingNode,
  ProviderSourceProjection,
} from "@relkit/graph";
import { providerMaps } from "./normalize-graph-app.js";
import {
  projectConnection,
  projectConnectionContract,
  projectNamedValues,
} from "./normalize-graph-provider-fields.js";
import { clean } from "./normalize-graph-utils.js";
import type { GraphNode, NormalizedDescriptor } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

type BindingProjection = Omit<ProviderBindingNode, "kind" | "id" | "source">;

export function providerNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  return providerMaps(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([capability, profiles]) =>
      isRecord(profiles)
        ? Object.entries(profiles)
            .sort(([left], [right]) => left.localeCompare(right))
            .flatMap(([profile, candidate]) => {
              const projection = projectBinding(capability, profile, candidate);
              return projection === undefined
                ? []
                : [
                    {
                      kind: "provider",
                      id: providerBindingId(capability, profile),
                      source: descriptor.source,
                      ...projection,
                    },
                  ];
            })
        : [],
    );
}

export function providerBindingId(capability: string, profile: string): string {
  return `provider.${capability}.${profile}`;
}

function projectBinding(
  capability: string,
  profile: string,
  candidate: unknown,
): BindingProjection | undefined {
  if (!isRecord(candidate) || candidate.kind !== "normalized-provider-source") return undefined;
  const adapter = projectAdapter(capability, candidate.adapter);
  const providerSource = projectSource(candidate.source);
  if (adapter === undefined || providerSource === undefined) return undefined;
  const namedValues = projectNamedValues(candidate.adapter, adapter.connectionContract);
  const local = projectLocal(candidate.local);
  const access = candidate.access === undefined ? undefined : clean(candidate.access);
  return {
    capability: capability as BindingProjection["capability"],
    profile,
    adapter: { ...adapter, connection: projectConnection(candidate.adapter, adapter) },
    providerSource,
    namedValues,
    ...(local === undefined ? {} : { local }),
    ...(access === undefined ? {} : { access }),
    deploymentRoles: providerDeploymentRoles(providerSource, access),
  };
}

function projectAdapter(
  capability: string,
  value: unknown,
): Omit<ProviderAdapterProjection, "connection"> | undefined {
  if (!isRecord(value) || value.kind !== "provider-adapter" || value.protocolVersion !== 1)
    return undefined;
  const integration = isRecord(value.integration) ? value.integration : {};
  const adapterCapability = isRecord(value.capability) ? value.capability : {};
  const contract = isRecord(value.connectionContract) ? value.connectionContract.fields : undefined;
  const behavior = isRecord(value.behavior) ? value.behavior.value : undefined;
  if (
    typeof integration.integrationId !== "string" ||
    adapterCapability.id !== capability ||
    typeof value.adapterId !== "string" ||
    !isRecord(contract) ||
    behavior === undefined
  ) {
    return undefined;
  }
  return {
    integrationId: integration.integrationId,
    adapterId: value.adapterId,
    protocolVersion: 1,
    behavior: clean(behavior),
    connectionContract: projectConnectionContract(contract),
    features: Array.isArray(value.features)
      ? value.features
          .flatMap((feature) =>
            isRecord(feature) && feature.capability === capability && typeof feature.id === "string"
              ? [feature.id]
              : [],
          )
          .sort()
      : [],
  };
}

function projectSource(value: unknown): ProviderSourceProjection | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "connected" || value.kind === "local-only") return { kind: value.kind };
  return value.kind === "infrastructure" && typeof value.integrationId === "string"
    ? { kind: "infrastructure", integrationId: value.integrationId, options: clean(value.options) }
    : undefined;
}

function projectLocal(value: unknown): ProviderBindingNode["local"] {
  return isRecord(value) &&
    typeof value.integrationId === "string" &&
    typeof value.recipeId === "string" &&
    Number.isSafeInteger(value.recipeVersion)
    ? {
        integrationId: value.integrationId,
        recipeId: value.recipeId,
        recipeVersion: value.recipeVersion,
      }
    : undefined;
}

function providerDeploymentRoles(
  source: ProviderSourceProjection,
  access: ReturnType<typeof clean> | undefined,
): readonly DeploymentRoleProjection[] {
  if (source.kind !== "infrastructure") return [];
  return [
    {
      role: "infrastructure",
      integrationId: source.integrationId,
      protocolVersion: 1,
      configuration: source.options,
    },
    ...(access === undefined
      ? []
      : [
          {
            role: "access" as const,
            integrationId: source.integrationId,
            protocolVersion: 1 as const,
            configuration: access,
          },
        ]),
  ];
}
