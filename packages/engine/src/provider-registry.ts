import { validateModelReadiness } from "./model-readiness.js";
import {
  collectRegistrations,
  collectRequirements,
  key,
  optional,
  registrationFor,
  replacementFor,
} from "./provider-registry-validation.js";
import type {
  ProviderRegistry,
  ProviderRegistryOptions,
  ProviderCapability,
} from "./provider-registry-types.js";
import {
  ProviderRegistryError,
  type AcquiredProvider,
  type ProviderHandle,
  type ProviderRequirement,
} from "./provider-registry-types.js";
import {
  configurationFor,
  create,
  issue,
  ready,
  releaseAll,
  validateOptions,
  validateRuntimeValue,
} from "./provider-registry-lifecycle.js";

export * from "./provider-registry-types.js";

export async function createProviderRegistry(
  options: ProviderRegistryOptions,
): Promise<ProviderRegistry> {
  validateOptions(options);
  const requirements = collectRequirements(options.graph);
  const registrations = collectRegistrations(options.runtimeIntegrationModules);
  const acquired: AcquiredProvider[] = [];
  const handles: Record<string, ProviderHandle> = {};
  let active: ProviderRequirement | undefined;
  try {
    for (const requirement of requirements) {
      active = requirement;
      const replacement = replacementFor(options.replacements, requirement);
      const generation =
        replacement ??
        (await create(
          registrationFor(registrations, requirement.binding),
          requirement,
          configurationFor(requirement, options),
          options,
        ));
      acquired.push({ binding: requirement.binding, generation });
      validateRuntimeValue(generation.value, requirement);
      await ready(generation, requirement, options.signal);
      handles[key(requirement.capability, requirement.profile)] = Object.freeze({
        capability: requirement.capability,
        profile: requirement.profile,
        binding: requirement.binding,
        value: generation.value,
      });
    }
    validateModelReadiness(options.graph, (profile) => handles[key("model", profile)]?.value);
  } catch (cause) {
    await releaseAll(acquired).catch(() => undefined);
    if (cause instanceof ProviderRegistryError) throw cause;
    throw issue(
      "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
      active,
      active === undefined
        ? "Provider construction failed."
        : `Provider construction failed for binding "${active.bindingId}".`,
    );
  }
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    await releaseAll(acquired);
  };
  const frozenHandles = Object.freeze(handles);
  return Object.freeze({
    generationId: options.generationId,
    requirements: Object.freeze(requirements),
    handles: frozenHandles,
    get: (capability: ProviderCapability, profile: string) =>
      frozenHandles[key(capability, profile)],
    resolve: (capability: ProviderCapability, profile: string) => {
      const handle = frozenHandles[key(capability, profile)];
      if (handle !== undefined) return handle;
      throw issue(
        "RELKIT_PROVIDER_PROFILE_UNKNOWN",
        undefined,
        `Provider binding "${capability}.${profile}" is not available.`,
      );
    },
    release,
    dispose: release,
  });
}
