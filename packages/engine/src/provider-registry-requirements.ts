/** Collects graph provider requirements and verifies profile coverage before runtime provider acquisition; invalid edges and duplicates retain the original provider diagnostics. */

import type { ApplicationGraph, GraphNode, ProviderBindingNode } from "@relkit/graph";
import { ProviderRegistryError, type ProviderRequirement } from "./provider-registry-types.js";
import { expectedProviders, isProviderNode } from "./provider-requirements.js";

/** Collect and sort validated provider requirements from the graph.
 * @returns Provider requirements sorted by stable capability/profile identity.
 * @param graph - Application graph being verified for this generation.
 */
export function collectRequirements(graph: ApplicationGraph): ProviderRequirement[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const required = new Map<string, ProviderRequirement>();
  const covered = new Set<string>();
  const profiles = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "uses-provider-profile") continue;
    const consumer = nodes.get(edge.from);
    const binding = nodes.get(edge.to);
    const expected = isProviderNode(binding)
      ? expectedProviders(consumer).find(
          (item) => item.capability === binding.capability && item.profile === binding.profile,
        )
      : undefined;
    if (expected === undefined || !isProviderNode(binding)) {
      invalidRequirement(
        consumer,
        `Provider requirement "${edge.from}" -> "${edge.to}" is invalid.`,
      );
    }
    const requirement = `${edge.from}\0${expected.capability}\0${expected.profile}`;
    if (covered.has(requirement)) {
      invalidRequirement(
        consumer,
        `Provider consumer "${edge.from}" has duplicate ${expected.capability}.${expected.profile} bindings.`,
      );
    }
    const profile = key(binding.capability, binding.profile);
    const owner = profiles.get(profile);
    if (owner !== undefined && owner !== binding.id) {
      invalidRequirement(
        consumer,
        `Provider profile ${binding.capability}.${binding.profile} is duplicated by "${owner}" and "${binding.id}".`,
      );
    }
    profiles.set(profile, binding.id);
    covered.add(requirement);
    required.set(binding.id, graphProviderRequirement(binding, consumer));
  }
  assertCoveredProviderConsumers(graph.nodes, covered);
  return [...required.values()].sort((left, right) =>
    left.bindingId.localeCompare(right.bindingId),
  );
}

/** Create the internal capability/profile lookup key.
 * @returns The internal capability/profile lookup key.
 * @param capability - Provider capability family required by the logical resource.
 * @param profile - Declared provider profile to resolve.
 */
export function key(capability: string, profile: string): string {
  return `${capability}\0${profile}`;
}

/** Reject a logical resource's invalid provider binding.
 * @returns Never; throws the stable compatibility error.
 * @param node - Logical graph resource being validated.
 * @param message - Safe compatibility diagnostic.
 */
function invalidRequirement(node: GraphNode | undefined, message: string): never {
  const [expected] = expectedProviders(node);
  throw new ProviderRegistryError([
    {
      code: "RELKIT_PROVIDER_METADATA_INVALID",
      message,
      ...(expected === undefined ? {} : expected),
      ...(node === undefined ? {} : { source: node.source }),
    },
  ]);
}
/** Projects one already-validated binding into the runtime requirement contract.
 * @param binding - Provider node checked against the consumer capability and profile.
 * @param consumer - Consumer whose valid edge establishes its source ownership.
 * @returns The original provider requirement projection.
 */
function graphProviderRequirement(
  binding: ProviderBindingNode,
  consumer: GraphNode | undefined,
): ProviderRequirement {
  // A matching expected provider above requires a real consumer before this projection.
  return {
    capability: binding.capability,
    profile: binding.profile,
    bindingId: binding.id,
    binding,
    ...(consumer?.kind !== "job"
      ? {}
      : { executionModel: consumer.executionModel === "task" ? "task" : "legacy-function" }),
    source: consumer!.source,
  };
}

/** Rejects logical consumers without a validated matching provider-profile edge.
 * @param nodes - Original graph nodes, checked in their stable graph order.
 * @param covered - Consumer/capability/profile triples validated from graph edges.
 * @returns Completion when all required profiles are covered.
 */
function assertCoveredProviderConsumers(
  nodes: ApplicationGraph["nodes"],
  covered: ReadonlySet<string>,
): void {
  for (const node of nodes) {
    for (const expected of expectedProviders(node)) {
      if (covered.has(`${node.id}\0${expected.capability}\0${expected.profile}`)) continue;
      invalidRequirement(
        node,
        `Provider consumer "${node.id}" has no ${expected.capability}.${expected.profile} binding.`,
      );
    }
  }
}
