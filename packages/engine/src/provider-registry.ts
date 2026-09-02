import { ProviderBindingResolutionError, type RuntimeProviderRegistration } from "@relkit/provider";
import { resolveProviderBindingConfiguration } from "./provider-binding-resolution.js";
import { validateModelReadiness } from "./model-readiness.js";
import {
  collectRegistrations,
  collectRequirements,
  key,
  optional,
  registrationFor,
  replacementFor,
} from "./provider-registry-validation.js";
import {
  ProviderRegistryError,
  type AcquiredProvider,
  type ProviderHandle,
  type ProviderRegistry,
  type ProviderRegistryErrorCode,
  type ProviderRegistryOptions,
  type ProviderCapability,
  type ProviderRequirement,
} from "./provider-registry-types.js";

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

function configurationFor(requirement: ProviderRequirement, options: ProviderRegistryOptions) {
  try {
    return resolveProviderBindingConfiguration(requirement.binding, {
      ...optional("values", options.bindingValues),
      ...optional("local", options.localBindingValues),
      ...optional("infrastructure", options.infrastructureBindingValues),
    });
  } catch (cause) {
    if (cause instanceof ProviderBindingResolutionError)
      throw issue("RELKIT_PROVIDER_CONFIGURATION_INVALID", requirement, cause.message);
    throw cause;
  }
}

async function create(
  registration: RuntimeProviderRegistration,
  requirement: ProviderRequirement,
  configuration: ReturnType<typeof configurationFor>,
  options: ProviderRegistryOptions,
) {
  try {
    return await registration.create({
      generationId: options.generationId,
      bindingId: requirement.bindingId,
      capability: requirement.capability,
      profile: requirement.profile,
      ...configuration,
      ...optional("signal", options.signal),
    });
  } catch {
    throw issue(
      "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
      requirement,
      `Provider construction failed for binding "${requirement.bindingId}".`,
    );
  }
}

async function ready(
  generation: Awaited<ReturnType<RuntimeProviderRegistration["create"]>>,
  requirement: ProviderRequirement,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (generation === null || typeof generation !== "object" || generation.value === undefined)
    throw issue(
      "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
      requirement,
      `Provider integration returned no value for binding "${requirement.bindingId}".`,
    );
  if (signal?.aborted)
    throw issue("RELKIT_PROVIDER_ABORTED", requirement, "Provider startup was aborted.");
  try {
    await generation.ready?.();
    await generation.readiness?.();
  } catch {
    throw issue(
      "RELKIT_PROVIDER_READINESS_FAILED",
      requirement,
      `Provider readiness failed for binding "${requirement.bindingId}".`,
    );
  }
  if (signal?.aborted)
    throw issue("RELKIT_PROVIDER_ABORTED", requirement, "Provider startup was aborted.");
}

async function releaseAll(acquired: readonly AcquiredProvider[]): Promise<void> {
  let failed = false;
  for (const { generation } of [...acquired].reverse()) {
    try {
      if (generation.release) await generation.release();
      else await generation.dispose?.();
    } catch {
      failed = true;
    }
  }
  if (failed) throw issue("RELKIT_PROVIDER_RELEASE_FAILED", undefined, "Provider release failed.");
}

function validateOptions(options: ProviderRegistryOptions): void {
  if (options.generationId.trim() === "")
    throw issue("RELKIT_PROVIDER_METADATA_INVALID", undefined, "Generation ID is required.");
  if (options.signal?.aborted)
    throw issue("RELKIT_PROVIDER_ABORTED", undefined, "Provider startup was aborted.");
}

function issue(
  code: ProviderRegistryErrorCode,
  requirement: ProviderRequirement | undefined,
  message: string,
): ProviderRegistryError {
  return new ProviderRegistryError([
    {
      code,
      message,
      ...(requirement === undefined
        ? {}
        : {
            capability: requirement.capability,
            profile: requirement.profile,
            source: requirement.source,
          }),
    },
  ]);
}
