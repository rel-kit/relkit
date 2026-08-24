import type { EnvMetadata, ProviderBinding, ProviderCapability, ProviderTopology } from "@zsys/app";
import type { SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph, GraphNode, ProviderProfileNode } from "@zsys/graph";
import { ProviderRegistryError } from "./provider-registry-types.js";
import type { ProviderRequirement } from "./provider-registry-types.js";

const capabilities = new Set<ProviderCapability>([
  "buckets",
  "cache",
  "jobs",
  "events",
  "models",
  "observability",
]);

export function collectRequirements(graph: ApplicationGraph): ProviderRequirement[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const result = new Map<string, ProviderRequirement>();
  for (const edge of graph.edges) {
    if (edge.kind !== "uses-provider-profile") continue;
    const binding = nodes.get(edge.to);
    if (!isProviderNode(binding)) continue;
    const requirement = {
      capability: binding.capability as ProviderCapability,
      profile: binding.profile,
      bindingId: binding.id,
      source: nodes.get(edge.from)?.source ?? binding.source,
    };
    result.set(key(requirement.capability, requirement.profile), requirement);
  }
  return [...result.values()].sort((left, right) =>
    key(left.capability, left.profile).localeCompare(key(right.capability, right.profile)),
  );
}

export function bindingFor(
  providers: ProviderTopology,
  requirement: ProviderRequirement,
): ProviderBinding {
  const profiles = providers[requirement.capability] as
    Readonly<Record<string, ProviderBinding>> | undefined;
  const binding = profiles?.[requirement.profile];
  if (binding !== undefined) return binding;
  throw issue(
    "ZSYS_PROVIDER_PROFILE_UNKNOWN",
    `Profile "${requirement.profile}" does not provide ${requirement.capability}.`,
    requirement.capability,
    requirement.profile,
    requirement.source,
  );
}

export function validateEnvironment(
  environment: string,
  metadata: Readonly<Record<string, EnvMetadata>> | undefined,
  values: Readonly<Record<string, unknown>> | undefined,
): void {
  if (metadata === undefined) return;
  for (const [variable, field] of Object.entries(metadata)) {
    const required =
      field.requiredIn.length > 0 ? field.requiredIn.includes(environment) : !field.optional;
    if (!required || field.hasDefault || values?.[variable] !== undefined) continue;
    throw new ProviderRegistryError([
      {
        code: "ZSYS_PROVIDER_ENVIRONMENT_INVALID",
        message: `Required environment variable "${variable}" is missing.`,
        variable,
      },
    ]);
  }
}

export function resolveBindingConfiguration(
  binding: ProviderBinding,
  values: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return resolveValue(binding.adapter.configuration, values) as Readonly<Record<string, unknown>>;
}

export function key(capability: ProviderCapability, profile: string): string {
  return `${capability}\0${profile}`;
}

export function factoryKey(capability: ProviderCapability, adapter: string): string {
  return `${capability}:${adapter}`;
}

function resolveValue(
  value: unknown,
  values: Readonly<Record<string, unknown>> | undefined,
): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, values));
  if (!isRecord(value)) return value;
  if (value.kind === "env-ref" && typeof value.name === "string") return values?.[value.name];
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, resolveValue(item, values)]),
  );
}

function isProviderNode(value: GraphNode | undefined): value is ProviderProfileNode {
  return (
    value?.kind === "provider" &&
    capabilities.has(value.capability as ProviderCapability) &&
    typeof value.profile === "string"
  );
}

function issue(
  code: "ZSYS_PROVIDER_PROFILE_UNKNOWN",
  message: string,
  capability: ProviderCapability,
  profile: string,
  source?: SourceLocation,
): ProviderRegistryError {
  return new ProviderRegistryError([
    { code, message, capability, profile, ...(source === undefined ? {} : { source }) },
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
