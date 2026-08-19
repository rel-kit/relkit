import {
  isProviderSet,
  providerRecipe,
  type ProviderCapability,
  type ProviderRecipe,
  type ProviderSet,
} from "@zsys/app";
import {
  getLocalProviderFactory,
  type LocalProviderEnvironment,
  type LocalProviderRecipe,
} from "@zsys/providers-local";
import {
  collectRequirements,
  key,
  makeHandles,
  validateEnvironment,
  validateRequirements,
} from "./provider-registry-validation.js";
import {
  PROVIDER_RECIPES as recipes,
  ProviderRegistryError,
  type ProviderEnvironment,
  type ProviderFactory,
  type ProviderFactoryContext,
  type ProviderGeneration,
  type ProviderHandle,
  type ProviderRegistryErrorCode,
  type ProviderRegistry,
  type ProviderRegistryOptions,
} from "./provider-registry-types.js";

export * from "./provider-registry-types.js";

export async function createProviderRegistry(
  options: ProviderRegistryOptions,
): Promise<ProviderRegistry> {
  const environment = options.environment;
  if (!(environment in recipes))
    throw error("ZSYS_PROVIDER_ENVIRONMENT_INVALID", "Unknown environment.");
  if (options.generationId.trim() === "")
    throw error("ZSYS_PROVIDER_METADATA_INVALID", "Generation ID is required.");
  if (options.signal?.aborted)
    throw error("ZSYS_PROVIDER_ABORTED", "Provider startup was aborted.");
  const sets = options.providers ?? options.providerSets;
  const providerSet = sets?.[environment];
  const recipe = providerRecipe(providerSet);
  if (!isProviderSet(providerSet) || recipe === undefined || recipe !== recipes[environment])
    throw error("ZSYS_PROVIDER_METADATA_INVALID", "Active provider metadata is invalid.");
  const requirements = collectRequirements(options.graph);
  validateRequirements(providerSet, requirements);
  validateEnvironment(environment, options.environmentMetadata, options.values);
  const factory = options.factories?.[recipe] ?? defaultFactory(recipe);
  if (factory === undefined)
    throw error("ZSYS_PROVIDER_FACTORY_MISSING", "No provider factory is bound.");
  if (factory.recipeTag !== recipe)
    throw error(
      "ZSYS_PROVIDER_FACTORY_MISMATCH",
      "Provider factory recipe does not match the active set.",
    );
  const context: ProviderFactoryContext = {
    generationId: options.generationId,
    environment,
    providerSet,
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  let generation: ProviderGeneration;
  try {
    generation = await factory.create(context);
  } catch {
    throw error("ZSYS_PROVIDER_CONSTRUCTION_FAILED", "Provider construction failed.");
  }
  try {
    await factory.ready?.(generation);
    await generation.ready?.();
    await generation.readiness?.();
    if (options.signal?.aborted)
      throw error("ZSYS_PROVIDER_ABORTED", "Provider startup was aborted.");
  } catch (cause) {
    await releaseOne(factory, generation).catch(() => undefined);
    if (cause instanceof ProviderRegistryError) throw cause;
    throw error("ZSYS_PROVIDER_READINESS_FAILED", "Provider readiness failed.");
  }
  let handles: Readonly<Record<string, ProviderHandle>>;
  try {
    handles = makeHandles(requirements, providerSet, generation);
  } catch (cause) {
    await releaseOne(factory, generation).catch(() => undefined);
    throw cause;
  }
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    await releaseOne(factory, generation);
  };
  return Object.freeze({
    generationId: options.generationId,
    environment,
    recipeTag: recipe,
    providerSet,
    requirements: Object.freeze(requirements),
    handles,
    get: (capability: ProviderCapability, profile: string) => handles[key(capability, profile)],
    resolve: (capability: ProviderCapability, profile: string) => {
      const handle = handles[key(capability, profile)];
      if (handle === undefined)
        throw error(
          "ZSYS_PROVIDER_PROFILE_UNKNOWN",
          "Provider profile is not available.",
          capability,
          profile,
        );
      return handle;
    },
    release,
    dispose: release,
  });
}

function defaultFactory(recipe: ProviderRecipe): ProviderFactory | undefined {
  const factory = getLocalProviderFactory(recipe);
  if (!factory) return undefined;
  return {
    recipeTag: factory.recipeTag,
    create: (context) =>
      factory.create({
        generationId: context.generationId,
        environment: context.environment as LocalProviderEnvironment,
        providerSet: context.providerSet as ProviderSet<LocalProviderRecipe>,
        ...(context.values === undefined ? {} : { values: context.values }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      }),
  };
}

async function releaseOne(factory: ProviderFactory, generation: ProviderGeneration): Promise<void> {
  try {
    if (factory.release) await factory.release(generation);
    else if (generation.release) await generation.release();
    else await generation.dispose?.();
  } catch {
    throw error("ZSYS_PROVIDER_RELEASE_FAILED", "Provider release failed.");
  }
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
