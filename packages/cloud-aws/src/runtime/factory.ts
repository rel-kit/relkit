import {
  isProviderSet,
  providerRecipe,
  type ProviderCapability,
  type ProviderSet,
} from "@zsys/app";
import type { ProviderFactory, ProviderFactoryContext, ProviderGeneration } from "@zsys/engine";
import { createEventBridgeProvider } from "./events.js";
import { configuredProfiles, profileConfig, resolveValue, text } from "./config.js";
import { createS3BucketProvider } from "./buckets.js";
import { createValkeyCacheProvider } from "./cache.js";
import { createSqsJobProvider } from "./jobs.js";
import { createOpenAiModelProvider } from "./models.js";
import { createAwsObservabilityProvider } from "./observability.js";

export type AwsProviderFactoryContext = ProviderFactoryContext;

export interface AwsProviderGeneration extends ProviderGeneration {
  readonly generationId: string;
  readonly environment: "production";
  readonly recipeTag: "aws";
  readonly providerSet: ProviderSet<"aws">;
  readonly providers: Readonly<Partial<Record<ProviderCapability, unknown>>>;
  readonly release: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

const factory: ProviderFactory = Object.freeze({
  recipeTag: "aws",
  create: async (context: ProviderFactoryContext): Promise<AwsProviderGeneration> =>
    createGeneration(context),
});

/** Runtime-only AWS binding for the production recipe tag. */
export const awsProviderFactories: Readonly<{ readonly aws: ProviderFactory }> = Object.freeze({
  aws: factory,
});

export function getAwsProviderFactory(recipe: string): ProviderFactory | undefined {
  return recipe === "aws" ? factory : undefined;
}

export function bindAwsProviderFactory(providerSet: ProviderSet): ProviderFactory | undefined {
  if (!isProviderSet(providerSet)) throw new TypeError("Invalid provider set");
  return providerRecipe(providerSet) === "aws" ? factory : undefined;
}

async function createGeneration(
  context: AwsProviderFactoryContext,
): Promise<AwsProviderGeneration> {
  if (context.generationId.trim() === "") throw new TypeError("Generation ID is required");
  if (context.environment !== "production") throw new TypeError("AWS providers require production");
  const providerSet = context.providerSet;
  if (!isAwsProviderSet(providerSet))
    throw new TypeError("Provider set does not use the aws recipe");
  if (context.signal?.aborted) throw context.signal.reason ?? new Error("AWS startup was aborted");
  const values = context.values;
  const region = text(
    resolveValue(providerSet.metadata.configuration.region, values),
    "AWS region",
  );
  if (region === undefined) throw new TypeError("AWS region is required");
  const buckets = profiles(providerSet, "buckets").map(
    (profile) =>
      [
        profile,
        createS3BucketProvider({
          region,
          ...profileConfig(providerSet, "buckets", profile, values),
          values,
        }),
      ] as const,
  );
  const cache = profiles(providerSet, "cache").map(
    (profile) =>
      [
        profile,
        createValkeyCacheProvider({
          cacheId: profile,
          ...profileConfig(providerSet, "cache", profile, values),
          values,
        }),
      ] as const,
  );
  const jobs = profiles(providerSet, "jobs").map(
    (profile) =>
      [
        profile,
        createSqsJobProvider({
          region,
          ...profileConfig(providerSet, "jobs", profile, values),
          values,
        }),
      ] as const,
  );
  const events = profiles(providerSet, "events").map(
    (profile) =>
      [
        profile,
        createEventBridgeProvider({
          region,
          ...profileConfig(providerSet, "events", profile, values),
          values,
        }),
      ] as const,
  );
  const models = profiles(providerSet, "models").map(
    (profile) => [profile, model(providerSet, profile, values)] as const,
  );
  const observability = createAwsObservabilityProvider();
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    await Promise.all([...cache.map(([, provider]) => provider.close()), observability.release()]);
  };
  const providers = Object.freeze({
    buckets: Object.freeze(Object.fromEntries(buckets)),
    cache: Object.freeze(Object.fromEntries(cache)),
    jobs: Object.freeze(Object.fromEntries(jobs)),
    events: Object.freeze(Object.fromEntries(events)),
    models: Object.freeze(Object.fromEntries(models)),
    observability: Object.freeze({ default: observability }),
  });
  return Object.freeze({
    generationId: context.generationId,
    environment: "production" as const,
    recipeTag: "aws" as const,
    providerSet,
    providers,
    ready: async () => undefined,
    readiness: async () => undefined,
    release,
    dispose: release,
  });
}

function isAwsProviderSet(value: ProviderSet): value is ProviderSet<"aws"> {
  return isProviderSet(value) && providerRecipe(value) === "aws";
}

function profiles(
  providerSet: ProviderSet<"aws">,
  capability: ProviderCapability,
): readonly string[] {
  return configuredProfiles(providerSet, capability);
}

function model(
  providerSet: ProviderSet<"aws">,
  profile: string,
  values: Readonly<Record<string, unknown>> | undefined,
) {
  const config = profileConfig(providerSet, "models", profile, values);
  const provider = text(config.provider, `AWS model ${profile} provider`);
  if (provider !== "openai")
    throw new TypeError(`AWS model provider ${provider ?? "unknown"} is unsupported`);
  return createOpenAiModelProvider({
    profile,
    apiKey: config.apiKey,
    model: config.model,
    endpoint: config.endpoint,
    values,
  });
}
