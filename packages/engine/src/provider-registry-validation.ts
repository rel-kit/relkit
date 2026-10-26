/** Validates explicitly selected runtime registrations and resolves provider factories; graph requirement coverage is validated by its dedicated pure collector. */

import type { ApplicationGraph, GraphNode, ProviderBindingNode } from "@relkit/graph";
import type { RuntimeProviderGeneration, RuntimeProviderRegistration } from "@relkit/provider";
import {
  ProviderRegistryError,
  type ProviderReplacements,
  type ProviderRequirement,
} from "./provider-registry-types.js";
import { expectedProviders, isProviderNode } from "./provider-requirements.js";
import type { LoadedRuntimeIntegrationModule } from "./runtime-integrations.js";
/** Validate explicitly loaded runtime integrations and index provider factories.
 * @returns Validated runtime registration lookup.
 * @param modules - Explicitly loaded runtime integration exports.
 */
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
      if (["telemetry", "agent-execution", "agent-deep"].includes(String(registration?.capability)))
        continue;
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
/** Resolve exactly one factory for a provider binding's adapter and capability.
 * @returns The matching provider factory registration.
 * @param registrations - Indexed runtime integration registrations.
 * @param binding - Verified provider or native task binding.
 */
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
/** Read an explicit generation replacement for a capability/profile pair.
 * @returns An explicit replacement generation, or undefined.
 * @param replacements - Explicit generation replacements keyed by capability/profile.
 * @param requirement - Verified logical-resource provider requirement.
 */
export function replacementFor(
  replacements: ProviderReplacements | undefined,
  requirement: ProviderRequirement,
): RuntimeProviderGeneration | undefined {
  return replacements?.[requirement.capability]?.[requirement.profile];
}
/** Read an optional string metadata field without coercion.
 * @typeParam Name - Selected connection-value source name.
 * @typeParam Value - Configuration value preserved by freezing.
 * @returns The optional string field, or undefined when absent.
 * @param name - Declared operation, dependency or field name.
 * @param value - Native value being validated or projected.
 */
export function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}
/** Build a deterministic runtime registration lookup key.
 * @returns build a deterministic runtime registration lookup key.
 * @param integrationId - Declared runtime integration identity.
 * @param value - Native value being validated or projected.
 */
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
/** Format a safe integration identity for diagnostics.
 * @returns format a safe integration identity for diagnostics.
 * @param integrationId - Declared runtime integration identity.
 * @param value - Native value being validated or projected.
 */
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
/** Reject malformed provider metadata with the stable provider diagnostic.
 * @returns Never; throws the stable compatibility error.
 * @param message - Safe compatibility diagnostic.
 */
function invalid(message: string): never {
  throw new ProviderRegistryError([{ code: "RELKIT_PROVIDER_INTEGRATION_INVALID", message }]);
}
/** Read a native record without coercing primitives.
 * @returns read a native record without coercing primitives.
 * @param value - Native value being validated or projected.
 */
function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export { collectRequirements, key } from "./provider-registry-requirements.js";
