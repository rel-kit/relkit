import type { ProviderCapability, ProviderSet, ProviderValue } from "@zsys/app";
import { createModelProviderRegistry } from "@zsys/agents";
import { join } from "node:path";
import {
  createLocalBucketProvider,
  type LocalBucketProvider,
  type LocalBucketProviderOptions,
} from "./buckets/index.js";
import {
  createLocalCacheProvider,
  type LocalCacheProvider,
  type LocalCacheProviderOptions,
} from "./cache/index.js";
import { createLocalEventProvider, type LocalEventProvider } from "./events/provider.js";
import {
  createLocalJobProvider,
  createLocalObservabilityProvider,
  type LocalJobProvider,
} from "./runtime-capabilities.js";
import type { LocalProviderStateRoot } from "./state.js";
export interface LocalProviderResources {
  readonly bucketProfiles: Readonly<Record<string, LocalBucketProvider>>;
  readonly cacheProfiles: Readonly<Record<string, LocalCacheProvider>>;
  readonly eventProfiles: Readonly<Record<string, LocalEventProvider>>;
  readonly jobProfiles: Readonly<Record<string, LocalJobProvider>>;
  readonly providers: Readonly<{
    readonly buckets: Readonly<Record<string, LocalBucketProvider>>;
    readonly cache: Readonly<Record<string, LocalCacheProvider>>;
    readonly jobs: Readonly<Record<string, LocalJobProvider>>;
    readonly events: Readonly<Record<string, LocalEventProvider>>;
    readonly observability: Readonly<
      Record<string, ReturnType<typeof createLocalObservabilityProvider>>
    >;
  }>;
  readonly modelRegistry?: unknown;
  readonly ready: () => Promise<void>;
  readonly release: () => Promise<void>;
}
export async function createLocalProviderResources(
  stateRoot: LocalProviderStateRoot,
  providerSet: ProviderSet<"local" | "test">,
  signal: AbortSignal | undefined,
  values?: Readonly<Record<string, unknown>>,
): Promise<LocalProviderResources> {
  const modelRegistry = await createModelProviderRegistry({
    configuration: providerSet.metadata.configuration.modelProviders,
    ...(values === undefined ? {} : { values }),
  });
  const buckets: Record<string, LocalBucketProvider> = {};
  const cache: Record<string, LocalCacheProvider> = {};
  const events: Record<string, LocalEventProvider> = {};
  const jobs: Record<string, LocalJobProvider> = {};
  try {
    for (const profile of profiles(providerSet, "buckets")) {
      checkAborted(signal);
      const root = join(stateRoot.buckets, profile);
      buckets[profile] = createLocalBucketProvider(
        bucketOptions(root, profileConfig(providerSet, "buckets", profile)),
      );
    }
    for (const profile of profiles(providerSet, "cache")) {
      checkAborted(signal);
      const root = join(stateRoot.cache, profile);
      cache[profile] = createLocalCacheProvider(
        cacheOptions(root, profile, profileConfig(providerSet, "cache", profile)),
      );
    }
    for (const profile of profiles(providerSet, "events")) {
      checkAborted(signal);
      events[profile] = await createLocalEventProvider(join(stateRoot.root, "events", profile));
    }
    for (const profile of profiles(providerSet, "jobs")) {
      jobs[profile] = createLocalJobProvider(stateRoot.root, profile);
    }
  } catch (cause) {
    await closeAll(cache, buckets, events, jobs);
    throw cause;
  }
  const bucketProfiles = Object.freeze(buckets);
  const cacheProfiles = Object.freeze(cache);
  const eventProfiles = Object.freeze(events);
  const jobProfiles = Object.freeze(jobs);
  const observabilityProfiles = Object.freeze(
    Object.fromEntries(
      profiles(providerSet, "observability").map((profile) => [
        profile,
        createLocalObservabilityProvider(),
      ]),
    ),
  );
  let released = false;
  const ready = async (): Promise<void> => {
    if (released) throw new Error("Local provider generation is closed");
    checkAborted(signal);
    await Promise.all([...Object.values(bucketProfiles).map((value) => value.ready())]);
    await Promise.all([...Object.values(cacheProfiles).map((value) => value.ready())]);
    checkAborted(signal);
  };
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    await closeAll(cacheProfiles, bucketProfiles, eventProfiles, jobProfiles);
  };
  return Object.freeze({
    bucketProfiles,
    cacheProfiles,
    eventProfiles,
    jobProfiles,
    providers: Object.freeze({
      buckets: bucketProfiles,
      cache: cacheProfiles,
      jobs: jobProfiles,
      events: eventProfiles,
      observability: observabilityProfiles,
    }),
    ...(modelRegistry === undefined ? {} : { modelRegistry }),
    ready,
    release,
  });
}
function profiles(
  providerSet: ProviderSet<"local" | "test">,
  capability: ProviderCapability,
): readonly string[] {
  const names = new Set<string>(["default"]);
  const configured = providerSet.metadata.configuration[capability] as unknown;
  if (isRecord(configured)) Object.keys(configured).forEach((name) => names.add(name));
  for (const [name, capabilities] of Object.entries(providerSet.metadata.profiles)) {
    if (capabilities.includes(capability)) names.add(name);
  }
  return [...names].sort();
}
function profileConfig(
  providerSet: ProviderSet<"local" | "test">,
  capability: ProviderCapability,
  profile: string,
): Record<string, ProviderValue> {
  const configured = providerSet.metadata.configuration[capability] as unknown;
  if (!isRecord(configured) || !isRecord(configured[profile])) return {};
  return configured[profile] as Record<string, ProviderValue>;
}
function bucketOptions(
  root: string,
  config: Record<string, ProviderValue>,
): LocalBucketProviderOptions {
  return {
    root,
    ...(has(config, "maxObjectBytes") ? { maxObjectBytes: config.maxObjectBytes as number } : {}),
    ...(has(config, "allowedContentTypes")
      ? { allowedContentTypes: config.allowedContentTypes as readonly string[] }
      : {}),
    ...(has(config, "pageSize") ? { pageSize: config.pageSize as number } : {}),
  };
}
function cacheOptions(
  root: string,
  profile: string,
  config: Record<string, ProviderValue>,
): LocalCacheProviderOptions {
  return {
    stateRoot: root,
    cacheId: has(config, "cacheId") ? (config.cacheId as string) : profile,
    ...(has(config, "schemaVersion")
      ? { schemaVersion: config.schemaVersion as string | number }
      : {}),
    ...(has(config, "defaultTtlMs") ? { defaultTtlMs: config.defaultTtlMs as number } : {}),
    ...(has(config, "maxTtlMs") ? { maxTtlMs: config.maxTtlMs as number } : {}),
    ...(has(config, "maxEntries") ? { maxEntries: config.maxEntries as number } : {}),
    ...(has(config, "maxBytes") ? { maxBytes: config.maxBytes as number } : {}),
    ...(has(config, "evictionPolicy") ? { evictionPolicy: config.evictionPolicy as "lru" } : {}),
  };
}
async function closeAll(
  cache: Readonly<Record<string, LocalCacheProvider>>,
  buckets: Readonly<Record<string, LocalBucketProvider>>,
  events: Readonly<Record<string, LocalEventProvider>>,
  jobs: Readonly<Record<string, LocalJobProvider>>,
): Promise<void> {
  const results = await Promise.allSettled([
    ...Object.values(cache).map((value) => value.close()),
    ...Object.values(buckets).map((value) => value.close()),
    ...Object.values(events).map((value) => value.close()),
    ...Object.values(jobs).map((value) => value.close()),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Local provider shutdown failed");
  }
}
function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Local provider startup was aborted");
}
function has(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
