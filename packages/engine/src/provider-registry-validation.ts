import type { ApplicationGraph, GraphNode, ProviderBindingNode } from "@relkit/graph";
import type { RuntimeProviderGeneration, RuntimeProviderRegistration } from "@relkit/provider";
import {
  ProviderRegistryError,
  type ProviderHandle,
  type ProviderReplacements,
  type ProviderRequirement,
} from "./provider-registry-types.js";
import type { LoadedRuntimeIntegrationModule } from "./runtime-integrations.js";
import { expectedProviders, isProviderNode } from "./provider-requirements.js";
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
    required.set(binding.id, {
      capability: binding.capability,
      profile: binding.profile,
      bindingId: binding.id,
      binding,
      source: consumer!.source,
    });
  }
  for (const node of graph.nodes) {
    for (const expected of expectedProviders(node)) {
      if (covered.has(`${node.id}\0${expected.capability}\0${expected.profile}`)) continue;
      invalidRequirement(
        node,
        `Provider consumer "${node.id}" has no ${expected.capability}.${expected.profile} binding.`,
      );
    }
  }
  return [...required.values()].sort((left, right) =>
    left.bindingId.localeCompare(right.bindingId),
  );
}
export function collectRegistrations(
  modules: readonly LoadedRuntimeIntegrationModule[],
): ReadonlyMap<string, RuntimeProviderRegistration> {
  const result = new Map<string, RuntimeProviderRegistration>();
  for (const loaded of modules) {
    const namespace = record(loaded.module);
    const integration = record(namespace?.runtimeIntegration);
    const integrationId = integration?.integrationId;
    if (
      integration?.kind !== "runtime-integration" ||
      typeof integrationId !== "string" ||
      !Array.isArray(integration.registrations)
    ) {
      invalid(`Runtime module ${JSON.stringify(loaded.packageName)} has invalid metadata.`);
    }
    for (const value of integration.registrations) {
      const registration = record(value);
      if (registration?.capability === "telemetry") continue;
      if (
        typeof registration?.capability !== "string" ||
        typeof registration.adapterId !== "string" ||
        registration.protocolVersion !== 1 ||
        typeof registration.create !== "function"
      ) {
        invalid(
          `Runtime integration ${JSON.stringify(integrationId)} has an invalid registration.`,
        );
      }
      const selected = registration as unknown as RuntimeProviderRegistration;
      const id = registrationKey(integrationId, selected);
      if (result.has(id))
        invalid(`Runtime provider registration ${label(integrationId, selected)} is duplicated.`);
      result.set(id, selected);
    }
  }
  return result;
}
export function registrationFor(
  registrations: ReadonlyMap<string, RuntimeProviderRegistration>,
  binding: ProviderBindingNode,
): RuntimeProviderRegistration {
  const registration = registrations.get(
    registrationKey(binding.adapter.integrationId, {
      capability: binding.capability,
      ...binding.adapter,
    }),
  );
  if (registration !== undefined) return registration;
  throw new ProviderRegistryError([
    {
      code: "RELKIT_PROVIDER_INTEGRATION_MISSING",
      message: `No runtime integration constructs binding "${binding.id}" (${label(binding.adapter.integrationId, { capability: binding.capability, ...binding.adapter })}).`,
      capability: binding.capability,
      profile: binding.profile,
      source: binding.source,
    },
  ]);
}
export function replacementFor(
  replacements: ProviderReplacements | undefined,
  requirement: ProviderRequirement,
): RuntimeProviderGeneration | undefined {
  return replacements?.[requirement.capability]?.[requirement.profile];
}
export function key(capability: string, profile: string): string {
  return `${capability}\0${profile}`;
}
export function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}
function registrationKey(
  integrationId: string,
  value: {
    readonly capability: string;
    readonly adapterId: string;
    readonly protocolVersion: number;
  },
): string {
  return `${integrationId}\0${value.capability}\0${value.adapterId}\0${value.protocolVersion}`;
}
function label(
  integrationId: string,
  value: {
    readonly capability: string;
    readonly adapterId: string;
    readonly protocolVersion: number;
  },
): string {
  return `${integrationId}:${value.capability}:${value.adapterId} protocol ${value.protocolVersion}`;
}
function invalid(message: string): never {
  throw new ProviderRegistryError([{ code: "RELKIT_PROVIDER_INTEGRATION_INVALID", message }]);
}
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
function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
