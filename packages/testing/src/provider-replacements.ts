import type { TestProviderReplacements } from "./provider-replacements.types.js";
export type { TestProviderReplacements } from "./provider-replacements.types.js";
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

/**
 * Copies explicit capability/profile replacements before resource acquisition.
 * @param input - Declared input passed through the owning schema authority.
 * @returns An immutable replacement map; invalid capability/profile declarations throw.
 */
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

/**
 * Acquires native providers and wires dependency clients with partial-failure release.
 * @param artifacts - Generated graph and integration modules, when available.
 * @param replacements - Explicit native capability/profile replacements.
 * @param bindingValues - Explicit resolved generated binding inputs.
 * @param fakes - Acquired owner-local deterministic dependency sources.
 * @param fakeResources - Whether generated missing resource profiles receive explicit fake storage.
 * @returns The acquired generation or undefined when no generated artifacts are present.
 */
export async function activateTestProviders(
  artifacts: TestApplicationArtifacts | undefined,
  replacements: TestProviderReplacements,
  bindingValues: Readonly<Record<string, JsonValue>> | undefined,
  fakes: TestFakes,
  fakeResources = false,
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
    replacements: runtimeReplacements(
      fakeResources
        ? resourceReplacements(artifacts.graph.nodes, replacements, fakes)
        : replacements,
    ),
  });
  try {
    wireProviderClients(artifacts.graph.nodes, artifacts.graph.edges, registry, fakes);
  } catch (error) {
    await registry.release();
    throw error;
  }
  return registry;
}

/**
 * Creates explicit bucket/cache fake replacements for missing generated profiles.
 * @param nodes - Compiled native graph nodes.
 * @param replacements - Explicit native capability/profile replacements.
 * @param fakes - Acquired owner-local deterministic dependency sources.
 * @returns The combined replacement map without replacing already supplied profiles.
 */
function resourceReplacements(
  nodes: readonly GraphNode[],
  replacements: TestProviderReplacements,
  fakes: TestFakes,
): TestProviderReplacements {
  const bucket = { ...replacements.bucket };
  const cache = { ...replacements.cache };
  for (const binding of nodes) {
    if (binding.kind !== "provider") continue;
    if (binding.capability === "bucket" && bucket[binding.profile] === undefined)
      bucket[binding.profile] = fakes.createBucket(binding.id);
    if (binding.capability === "cache" && cache[binding.profile] === undefined)
      cache[binding.profile] = fakes.createCache(binding.id);
  }
  return { ...replacements, bucket, cache };
}

/**
 * Converts fake/provider overrides into native generation declarations.
 * @param input - Declared input passed through the owning schema authority.
 * @returns An immutable production registry replacement map.
 */
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

/**
 * Extracts a native provider and its optional owned release hook.
 * @param value - Candidate native value checked or detached by this helper.
 * @param label - Existing validation label for this provider declaration.
 * @returns A generation value retaining release's original receiver.
 */
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

/**
 * Binds graph-declared logical dependencies to resolved native profiles.
 * @param nodes - Compiled native graph nodes.
 * @param edges - Compiled native graph relationships or captured agent relationship ledger.
 * @param registry - Acquired native provider generation authority.
 * @param fakes - Acquired owner-local deterministic dependency sources.
 * @returns Nothing after updating the owner-local client sources.
 */
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

/**
 * Maps native provider capability to the existing dependency namespace.
 * @param capability - Native provider capability being mapped.
 * @returns The matching dependency category or undefined.
 */
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

/**
 * Checks graph node kind before reading provider-specific fields.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True for a provider binding node.
 */
function isProvider(value: GraphNode | undefined): value is ProviderBindingNode {
  return value?.kind === "provider";
}

/**
 * Checks the shallow replacement object boundary.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns The object record or undefined.
 */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
