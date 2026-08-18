import type { SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph, GraphNode } from "@zsys/graph";
import type { ProviderCapability, ProviderSet } from "@zsys/app";
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
    const configured = metadata.profiles[requirement.profile];
    const supported =
      configured === undefined && requirement.profile === "default"
        ? metadata.capabilities
        : configured;
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
  for (const capability of providerSet.metadata.capabilities)
    pairs.set(key(capability, "default"), { capability, profile: "default" });
  const values = generation.providers;
  return Object.freeze(
    Object.fromEntries(
      [...pairs.values()].map(({ capability, profile }) => [
        key(capability, profile),
        Object.freeze({
          capability,
          profile,
          value:
            values && Object.prototype.hasOwnProperty.call(values, capability)
              ? values[capability]
              : generation,
        }),
      ]),
    ),
  ) as Readonly<Record<string, ProviderHandle>>;
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
