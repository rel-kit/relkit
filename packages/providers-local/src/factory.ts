import type { ProviderBinding, ProviderCapability } from "@zsys/app";
import type { MaybePromise } from "@zsys/contracts";
import { join } from "node:path";
import { createLocalBucketProvider } from "./buckets/index.js";
import { createLocalCacheProvider } from "./cache/index.js";
import { createLocalEventProvider } from "./events/provider.js";
import {
  createLocalJobProvider,
  createLocalObservabilityProvider,
} from "./runtime-capabilities.js";
import { createLocalProviderStateRoot } from "./state.js";

export interface LocalBindingFactoryContext {
  readonly generationId: string;
  readonly environment: "development" | "test" | "production";
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly binding: ProviderBinding;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export interface LocalBindingGeneration {
  readonly value?: unknown;
  readonly modelRegistry?: unknown;
  readonly ready?: () => MaybePromise<void>;
  readonly release?: () => MaybePromise<void>;
  readonly dispose?: () => MaybePromise<void>;
}

export interface LocalBindingFactory {
  readonly capability: ProviderCapability;
  readonly adapter: "memory";
  readonly create: (context: LocalBindingFactoryContext) => MaybePromise<LocalBindingGeneration>;
}

export const localProviderFactories: Readonly<Record<ProviderCapability, LocalBindingFactory>> =
  Object.freeze({
    buckets: factory("buckets", createBucket),
    cache: factory("cache", createCache),
    jobs: factory("jobs", createJobs),
    events: factory("events", createEvents),
    models: factory("models", createModels),
    observability: factory("observability", createObservability),
  });

export function getLocalProviderFactory(
  capability: ProviderCapability,
): LocalBindingFactory | undefined {
  return localProviderFactories[capability];
}

function factory(
  capability: ProviderCapability,
  create: (context: LocalBindingFactoryContext) => MaybePromise<LocalBindingGeneration>,
): LocalBindingFactory {
  return Object.freeze({ capability, adapter: "memory" as const, create });
}

function createBucket(context: LocalBindingFactoryContext): LocalBindingGeneration {
  const provider = createLocalBucketProvider({
    root: join(stateRoot(context).buckets, context.profile),
  });
  return { value: provider, ready: provider.ready, release: provider.close };
}

function createCache(context: LocalBindingFactoryContext): LocalBindingGeneration {
  const provider = createLocalCacheProvider({
    stateRoot: join(stateRoot(context).cache, context.profile),
    cacheId: context.profile,
  });
  return { value: provider, ready: provider.ready, release: provider.close };
}

async function createEvents(context: LocalBindingFactoryContext): Promise<LocalBindingGeneration> {
  const provider = await createLocalEventProvider(
    join(stateRoot(context).root, "events", context.profile),
  );
  return { value: provider, release: provider.close };
}

function createJobs(context: LocalBindingFactoryContext): LocalBindingGeneration {
  const provider = createLocalJobProvider(stateRoot(context).root, context.profile);
  return { value: provider, release: provider.close };
}

function createObservability(_context: LocalBindingFactoryContext): LocalBindingGeneration {
  return { value: createLocalObservabilityProvider() };
}

function createModels(_context: LocalBindingFactoryContext): LocalBindingGeneration {
  const modelRegistry = Object.freeze({
    resolveModel: (selector?: string) => ({
      provider: "test",
      id: selector ?? "test:default",
      model: Object.freeze({ provider: "zsys.test", modelId: "default" }),
    }),
  });
  return { modelRegistry };
}

function stateRoot(context: LocalBindingFactoryContext) {
  check(context);
  return createLocalProviderStateRoot(
    join(process.cwd(), ".zsys", "state", "testing", context.generationId),
  );
}

function check(context: LocalBindingFactoryContext): void {
  if (context.generationId.trim() === "") throw new TypeError("Generation ID is required");
  if (context.signal?.aborted) {
    throw context.signal.reason ?? new Error("Provider generation was aborted");
  }
}
