import { isProviderTopology, type ProviderCapability, type ProviderTopology } from "@relkit/app";
import { getLocalProviderFactory } from "@relkit/providers-local";
import {
  bindingFor,
  collectRequirements,
  factoryKey,
  key,
  resolveBindingConfiguration,
  validateEnvironment,
} from "./provider-registry-validation.js";
import { validateModelReadiness } from "./model-readiness.js";
import {
  ProviderRegistryError,
  type ProviderFactory,
  type ProviderGeneration,
  type ProviderHandle,
  type ProviderRequirement,
  type ProviderRegistry,
  type ProviderRegistryErrorCode,
  type ProviderRegistryOptions,
} from "./provider-registry-types.js";

export * from "./provider-registry-types.js";
export { factoryKey as providerFactoryKey } from "./provider-registry-validation.js";

export async function createProviderRegistry(
  options: ProviderRegistryOptions,
): Promise<ProviderRegistry> {
  validateOptions(options);
  validateEnvironment(options.environment, options.environmentMetadata, options.values);
  const requirements = collectRequirements(options.graph);
  const acquired: Acquired[] = [];
  const handles: Record<string, ProviderHandle> = {};
  let modelRegistry: unknown;
  let activeRequirement: ProviderRequirement | undefined;
  try {
    for (const requirement of requirements) {
      activeRequirement = requirement;
      const binding = bindingFor(options.providers, requirement);
      const useTestFactory =
        options.environment === "test" && options.useConfiguredAdaptersInTests !== true;
      const factory = useTestFactory
        ? (options.testFactories?.[requirement.capability] ??
          getLocalProviderFactory(requirement.capability))
        : options.factories?.[factoryKey(requirement.capability, binding.adapter.adapter)];
      if (factory === undefined) {
        throw error(
          "RELKIT_PROVIDER_FACTORY_MISSING",
          `No factory is registered for ${requirement.capability}:${binding.adapter.adapter}.`,
          requirement.capability,
          requirement.profile,
        );
      }
      if (factory.capability !== requirement.capability) {
        throw error(
          "RELKIT_PROVIDER_FACTORY_MISMATCH",
          "Provider factory capability does not match the binding.",
          requirement.capability,
          requirement.profile,
        );
      }
      const generation = await construct(factory, {
        generationId: options.generationId,
        environment: options.environment,
        capability: requirement.capability,
        profile: requirement.profile,
        binding,
        configuration: useTestFactory
          ? Object.freeze({})
          : resolveBindingConfiguration(binding, options.values),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      acquired.push({ factory, generation });
      if (generation.modelRegistry !== undefined) modelRegistry = generation.modelRegistry;
      if (requirement.capability !== "models" && generation.value === undefined) {
        throw error(
          "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
          "Provider factory returned no client.",
          requirement.capability,
          requirement.profile,
        );
      }
      handles[key(requirement.capability, requirement.profile)] = Object.freeze({
        capability: requirement.capability,
        profile: requirement.profile,
        binding,
        value: generation.value ?? generation.modelRegistry,
      });
    }
    validateModelReadiness(options.graph, modelRegistry);
  } catch (cause) {
    await releaseAll(acquired).catch(() => undefined);
    if (cause instanceof ProviderRegistryError) throw cause;
    throw error(
      "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
      `Provider construction failed${
        activeRequirement === undefined
          ? ""
          : ` for ${activeRequirement.capability}:${activeRequirement.profile}`
      }: ${errorMessage(cause)}`,
      activeRequirement?.capability,
      activeRequirement?.profile,
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
    environment: options.environment,
    providers: options.providers,
    ...(modelRegistry === undefined ? {} : { modelRegistry }),
    requirements: Object.freeze(requirements),
    handles: frozenHandles,
    get: (capability: ProviderCapability, profile: string) =>
      frozenHandles[key(capability, profile)],
    resolve: (capability: ProviderCapability, profile: string) => {
      const handle = frozenHandles[key(capability, profile)];
      if (handle !== undefined) return handle;
      throw error(
        "RELKIT_PROVIDER_PROFILE_UNKNOWN",
        "Provider profile is not available.",
        capability,
        profile,
      );
    },
    release,
    dispose: release,
  });
}

interface Acquired {
  readonly factory: ProviderFactory;
  readonly generation: ProviderGeneration;
}

async function construct(
  factory: ProviderFactory,
  context: Parameters<ProviderFactory["create"]>[0],
): Promise<ProviderGeneration> {
  const generation = await factory.create(context);
  await factory.ready?.(generation);
  await generation.ready?.();
  await generation.readiness?.();
  if (context.signal?.aborted)
    throw error("RELKIT_PROVIDER_ABORTED", "Provider startup was aborted.");
  return generation;
}

async function releaseAll(acquired: readonly Acquired[]): Promise<void> {
  for (const { factory, generation } of [...acquired].reverse()) {
    try {
      if (factory.release) await factory.release(generation);
      else if (generation.release) await generation.release();
      else await generation.dispose?.();
    } catch {
      throw error("RELKIT_PROVIDER_RELEASE_FAILED", "Provider release failed.");
    }
  }
}

function validateOptions(options: ProviderRegistryOptions): void {
  if (options.generationId.trim() === "") {
    throw error("RELKIT_PROVIDER_METADATA_INVALID", "Generation ID is required.");
  }
  if (!isProviderTopology(options.providers)) {
    throw error("RELKIT_PROVIDER_METADATA_INVALID", "Provider topology is invalid.");
  }
  if (options.signal?.aborted)
    throw error("RELKIT_PROVIDER_ABORTED", "Provider startup was aborted.");
}

function error(
  code: ProviderRegistryErrorCode,
  message: string,
  capability?: ProviderCapability,
  profile?: string,
): ProviderRegistryError {
  return new ProviderRegistryError([
    {
      code,
      message,
      ...(capability === undefined ? {} : { capability }),
      ...(profile === undefined ? {} : { profile }),
    },
  ]);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
