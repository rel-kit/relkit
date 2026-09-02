import { isStableId, type JsonValue } from "@relkit/contracts";
import {
  createProviderRegistry,
  type ProviderCapability,
  type ProviderRegistry,
  type ProviderReplacements,
} from "@relkit/engine";
import { PROVIDER_CAPABILITIES, type GraphNode, type ProviderBindingNode } from "@relkit/graph";
import type { DependencyCategory } from "@relkit/engine";
import type { TestApplicationArtifacts } from "./application-registry.js";
import type { TestFakes } from "./fakes.js";

export type TestProviderReplacements = Readonly<
  Partial<Record<ProviderCapability, Readonly<Record<string, unknown>>>>
>;

export function copyTestProviderReplacements(
  input: TestProviderReplacements | undefined,
): TestProviderReplacements {
  if (input === undefined) return Object.freeze({});
  if (!record(input)) throw new TypeError("Test provider replacements must be an object.");
  const result: Partial<Record<ProviderCapability, Readonly<Record<string, unknown>>>> = {};
  for (const [capability, value] of Object.entries(input)) {
    if (!(PROVIDER_CAPABILITIES as readonly string[]).includes(capability) || !record(value))
      throw new TypeError(`Test provider capability "${capability}" is invalid.`);
    const profiles: Record<string, unknown> = {};
    for (const [profile, replacement] of Object.entries(value)) {
      if (!isStableId(profile) || replacement === undefined)
        throw new TypeError(`Test provider profile "${capability}.${profile}" is invalid.`);
      profiles[profile] = replacement;
    }
    result[capability as ProviderCapability] = Object.freeze(profiles);
  }
  return Object.freeze(result);
}

export async function activateTestProviders(
  artifacts: TestApplicationArtifacts | undefined,
  replacements: TestProviderReplacements,
  bindingValues: Readonly<Record<string, JsonValue>> | undefined,
  fakes: TestFakes,
): Promise<ProviderRegistry | undefined> {
  if (artifacts === undefined) {
    if (Object.keys(replacements).length > 0)
      throw new Error("Test provider replacements require generated application artifacts.");
    return undefined;
  }
  const registry = await createProviderRegistry({
    generationId: "generation.test-application",
    graph: artifacts.graph,
    runtimeIntegrationModules: artifacts.runtimeIntegrationModules,
    ...(bindingValues === undefined ? {} : { bindingValues }),
    replacements: runtimeReplacements(replacements),
  });
  wireProviderClients(artifacts.graph.nodes, artifacts.graph.edges, registry, fakes);
  return registry;
}

function runtimeReplacements(input: TestProviderReplacements): ProviderReplacements {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(input).map(([capability, profiles]) => [
        capability,
        Object.freeze(
          Object.fromEntries(
            Object.entries(profiles ?? {}).map(([profile, value]) => [
              profile,
              generation(value, `${capability}.${profile}`),
            ]),
          ),
        ),
      ]),
    ),
  ) as ProviderReplacements;
}

function generation(value: unknown, label: string) {
  const owner = record(value);
  const provider = owner !== undefined && Object.hasOwn(owner, "provider") ? owner.provider : value;
  if (provider === undefined)
    throw new TypeError(`Test provider replacement "${label}" is invalid.`);
  const close = owner?.close;
  return Object.freeze({
    value: provider,
    ...(typeof close === "function" ? { release: () => close.call(value) } : {}),
  });
}

function wireProviderClients(
  nodes: readonly GraphNode[],
  edges: readonly { readonly kind: string; readonly from: string; readonly to: string }[],
  registry: ProviderRegistry,
  fakes: TestFakes,
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.kind !== "uses-provider-profile") continue;
    const binding = byId.get(edge.to);
    const logical = byId.get(edge.from);
    if (!isProvider(binding) || logical === undefined) continue;
    const category = dependencyCategory(binding.capability);
    if (category !== undefined)
      fakes.setClient(
        category,
        logical.id,
        registry.resolve(binding.capability, binding.profile).value,
      );
  }
}

function dependencyCategory(capability: ProviderCapability): DependencyCategory | undefined {
  switch (capability) {
    case "bucket":
      return "buckets";
    case "cache":
      return "cache";
    case "job":
      return "jobs";
    case "event":
      return "events";
    default:
      return undefined;
  }
}

function isProvider(value: GraphNode | undefined): value is ProviderBindingNode {
  return value?.kind === "provider";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
