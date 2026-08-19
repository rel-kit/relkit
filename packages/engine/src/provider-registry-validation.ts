import type { SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph, GraphNode } from "@zsys/graph";
import type { EnvMetadata, ProviderCapability, ProviderSet } from "@zsys/app";
import { ProviderRegistryError } from "./provider-registry-types.js";
import type {
  ProviderHandle,
  ProviderGeneration,
  ProviderRequirement,
} from "./provider-registry-types.js";

const capabilities = new Set<ProviderCapability>([
  "buckets",
  "cache",
  "jobs",
  "events",
  "models",
  "observability",
]);

export function collectRequirements(graph: ApplicationGraph): ProviderRequirement[] {
  const result = new Map<string, ProviderRequirement>();
  const add = (capability: ProviderCapability, profile: string, source?: SourceLocation): void => {
    if (!capabilities.has(capability)) return;
    const item = { capability, profile, ...(source === undefined ? {} : { source }) };
    result.set(key(capability, profile), result.get(key(capability, profile)) ?? item);
  };
  for (const node of graph.nodes) {
    const requirement = nodeRequirement(node);
    if (requirement) add(requirement.capability, requirement.profile, node.source);
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (edge.kind !== "uses-provider-profile") continue;
    const requirement = nodeRequirement(nodes.get(edge.from));
    if (requirement) add(requirement.capability, edge.to, nodes.get(edge.from)?.source);
  }
  return [...result.values()].sort((left, right) =>
    key(left.capability, left.profile).localeCompare(key(right.capability, right.profile)),
  );
}

export function validateRequirements(
  providerSet: ProviderSet,
  requirements: readonly ProviderRequirement[],
): void {
  const metadata = providerSet.metadata;
  for (const requirement of requirements) {
    const supported =
      requirement.profile === "default"
        ? metadata.capabilities
        : metadata.profiles[requirement.profile];
    if (
      supported === undefined ||
      !metadata.capabilities.includes(requirement.capability) ||
      !supported.includes(requirement.capability)
    ) {
      throw new ProviderRegistryError([
        {
          code: "ZSYS_PROVIDER_PROFILE_UNKNOWN",
          message: `Profile "${requirement.profile}" does not provide ${requirement.capability}.`,
          capability: requirement.capability,
          profile: requirement.profile,
          ...(requirement.source === undefined ? {} : { source: requirement.source }),
        },
      ]);
    }
  }
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

export function makeHandles(
  requirements: readonly ProviderRequirement[],
  providerSet: ProviderSet,
  generation: ProviderGeneration,
): Readonly<Record<string, ProviderHandle>> {
  const pairs = new Map(requirements.map((item) => [key(item.capability, item.profile), item]));
  for (const [profile, supported] of Object.entries(providerSet.metadata.profiles)) {
    for (const capability of supported) {
      if (capabilities.has(capability))
        pairs.set(key(capability, profile), { capability, profile });
    }
  }
  for (const { capability } of [...pairs.values()])
    pairs.set(key(capability, "default"), { capability, profile: "default" });
  const values = generation.providers;
  return Object.freeze(
    Object.fromEntries(
      [...pairs.values()].map(({ capability, profile }) => [
        key(capability, profile),
        Object.freeze({
          capability,
          profile,
          value: selectProvider(
            values?.[capability],
            capability,
            profile,
            providerSet.metadata.profiles,
          ),
        }),
      ]),
    ),
  ) as Readonly<Record<string, ProviderHandle>>;
}

function selectProvider(
  capabilityValue: unknown,
  capability: ProviderCapability,
  profile: string,
  profiles: Readonly<Record<string, readonly ProviderCapability[]>>,
): unknown {
  const profileMap =
    capabilityValue instanceof Map ||
    (isRecord(capabilityValue) &&
      (Object.prototype.hasOwnProperty.call(capabilityValue, profile) ||
        Object.prototype.hasOwnProperty.call(capabilityValue, "default") ||
        Object.entries(profiles).some(
          ([name, supported]) =>
            name !== "default" &&
            supported.includes(capability) &&
            Object.prototype.hasOwnProperty.call(capabilityValue, name),
        )));
  const selected = profileMap
    ? capabilityValue instanceof Map
      ? capabilityValue.get(profile)
      : isRecord(capabilityValue) && Object.prototype.hasOwnProperty.call(capabilityValue, profile)
        ? capabilityValue[profile]
        : undefined
    : profile === "default"
      ? capabilityValue
      : undefined;
  if (selected === undefined) {
    throw new ProviderRegistryError([
      {
        code: "ZSYS_PROVIDER_PROFILE_UNKNOWN",
        message: `Profile "${profile}" has no ${capability} runtime provider.`,
        capability,
        profile,
      },
    ]);
  }
  return selected;
}

export function key(capability: ProviderCapability, profile: string): string {
  return `${capability}\0${profile}`;
}

function nodeRequirement(
  node: GraphNode | undefined,
): { capability: ProviderCapability; profile: string } | undefined {
  if (!node) return undefined;
  if (node.kind === "bucket" || node.kind === "cache" || node.kind === "job")
    return {
      capability: node.kind === "bucket" ? "buckets" : node.kind === "cache" ? "cache" : "jobs",
      profile: node.profile,
    };
  if (node.kind === "agent") return { capability: "models", profile: node.modelProfile };
  if (node.kind !== "trigger" || node.triggerType !== "event") return undefined;
  const profile =
    isRecord(node.config) && typeof node.config.profile === "string"
      ? node.config.profile
      : "default";
  return { capability: "events", profile };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
