import { isProviderSet, providerRecipe, type ProviderRecipe, type ProviderSet } from "@zsys/app";
import { createLocalProviderResources, type LocalProviderResources } from "./generation.js";
import { createLocalProviderStateRoot } from "./state.js";

export type LocalProviderRecipe = Extract<ProviderRecipe, "local" | "test">;
export type LocalProviderEnvironment = "development" | "test";

export interface LocalProviderFactoryContext {
  readonly generationId: string;
  readonly environment: LocalProviderEnvironment;
  readonly providerSet: ProviderSet<LocalProviderRecipe>;
  /** Resolved values are runtime-only and are never copied into the graph. */
  readonly values?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  /** Runtime-only override used by isolated provider tests. */
  readonly stateRoot?: string;
}

export interface LocalProviderGeneration {
  readonly generationId: string;
  readonly environment: LocalProviderEnvironment;
  readonly recipeTag: LocalProviderRecipe;
  readonly providerSet: ProviderSet<LocalProviderRecipe>;
  readonly stateRoot: string;
  readonly bucketProfiles: LocalProviderResources["bucketProfiles"];
  readonly cacheProfiles: LocalProviderResources["cacheProfiles"];
  readonly jobProfiles: LocalProviderResources["jobProfiles"];
  readonly providers: LocalProviderResources["providers"];
  readonly modelRegistry?: unknown;
  readonly ready: () => Promise<void>;
  readonly readiness: () => Promise<void>;
  readonly release: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export interface LocalProviderFactory {
  readonly recipeTag: LocalProviderRecipe;
  readonly create: (context: LocalProviderFactoryContext) => Promise<LocalProviderGeneration>;
}

/** Runtime-only bindings for the Phase 2 local and test recipe tags. */
export const localProviderFactories: Readonly<Record<LocalProviderRecipe, LocalProviderFactory>> =
  Object.freeze({
    local: createFactory("local", "development"),
    test: createFactory("test", "test"),
  });

/** Returns no factory for `aws`; production binding belongs to Phase 15. */
export function getLocalProviderFactory(recipe: ProviderRecipe): LocalProviderFactory | undefined {
  return recipe === "local" || recipe === "test" ? localProviderFactories[recipe] : undefined;
}

/** Binds a validated provider declaration to its local/test generation factory. */
export function bindLocalProviderFactory(
  providerSet: ProviderSet,
): LocalProviderFactory | undefined {
  if (!isProviderSet(providerSet)) throw new TypeError("Invalid provider set");
  const recipe = providerRecipe(providerSet);
  return recipe === undefined ? undefined : getLocalProviderFactory(recipe);
}

function createFactory(
  recipeTag: LocalProviderRecipe,
  environment: LocalProviderEnvironment,
): LocalProviderFactory {
  return Object.freeze({
    recipeTag,
    create: async (context: LocalProviderFactoryContext): Promise<LocalProviderGeneration> => {
      if (context.generationId.trim() === "") throw new TypeError("Generation ID is required");
      if (context.environment !== environment) {
        throw new TypeError(`${recipeTag} providers require the ${environment} environment`);
      }
      if (
        !isProviderSet(context.providerSet) ||
        providerRecipe(context.providerSet) !== recipeTag
      ) {
        throw new TypeError(`Provider set does not use the ${recipeTag} recipe`);
      }
      if (context.signal?.aborted) {
        throw context.signal.reason ?? new Error("Provider generation was aborted");
      }
      const stateRoot = createLocalProviderStateRoot(
        context.stateRoot ?? configuredStateDirectory(context),
      );
      let resources: Awaited<ReturnType<typeof createLocalProviderResources>> | undefined;
      try {
        resources = await createLocalProviderResources(
          stateRoot,
          context.providerSet,
          context.signal,
          context.values,
        );
        await resources.ready();
      } catch (cause) {
        await resources?.release().catch(() => undefined);
        throw cause;
      }
      let released = false;
      const release = async (): Promise<void> => {
        if (released) return;
        released = true;
        await resources!.release();
      };
      const ready = async (): Promise<void> => {
        if (released) throw new Error("Local provider generation is closed");
        await resources!.ready();
      };
      return Object.freeze({
        generationId: context.generationId,
        environment,
        recipeTag,
        providerSet: context.providerSet,
        stateRoot: stateRoot.root,
        bucketProfiles: resources.bucketProfiles,
        cacheProfiles: resources.cacheProfiles,
        jobProfiles: resources.jobProfiles,
        providers: resources.providers,
        ...(resources.modelRegistry === undefined
          ? {}
          : { modelRegistry: resources.modelRegistry }),
        ready,
        readiness: ready,
        release,
        dispose: release,
      });
    },
  });
}

function configuredStateDirectory(context: LocalProviderFactoryContext): string | undefined {
  const value = context.providerSet.metadata.configuration.stateDirectory;
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (isRecord(value) && value.kind === "env-ref" && typeof value.name === "string") {
    const resolved = context.values?.[value.name];
    if (typeof resolved === "string" && resolved.trim() !== "") return resolved;
  }
  throw new TypeError("Local provider state directory was not resolved");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
