import { expect, test } from "bun:test";
import { defineEnv, env, external, redis, s3, type ProviderTopology } from "@zsys/app";
import { GRAPH_VERSION, type SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph, ProviderProfileNode } from "@zsys/graph";
import {
  createProviderRegistry,
  type ProviderFactories,
  type ProviderFactory,
} from "./src/provider-registry.ts";

const source: SourceLocation = { file: "src/app.ts", line: 1, column: 1 };

test("constructs only required bindings with isolated resolved configuration", async () => {
  const values = defineEnv({
    CACHE_URL: env.secret(),
    BUCKET_SECRET: env.secret(),
  });
  const providers: ProviderTopology = {
    cache: { default: external(redis({ url: values.CACHE_URL })) },
    buckets: {
      default: external(
        s3({
          endpoint: "https://example.test",
          bucketName: "unused",
          region: "auto",
          credentials: { secretAccessKey: values.BUCKET_SECRET },
        }),
      ),
    },
  };
  const contexts: Readonly<Record<string, unknown>>[] = [];
  let bucketCreates = 0;
  const factories: ProviderFactories = {
    "cache:redis": factory("cache", "redis", (configuration) => {
      contexts.push(configuration);
      return { get: async () => undefined };
    }),
    "buckets:s3": factory("buckets", "s3", () => {
      bucketCreates += 1;
      return {};
    }),
  };
  const registry = await createProviderRegistry({
    generationId: "generation-isolated",
    environment: "production",
    providers,
    graph: cacheGraph(),
    values: { CACHE_URL: "rediss://cache.example", BUCKET_SECRET: "must-not-cross" },
    factories,
  });

  expect(contexts).toEqual([{ url: "rediss://cache.example" }]);
  expect(JSON.stringify(contexts)).not.toContain("must-not-cross");
  expect(bucketCreates).toBe(0);
  expect(registry.resolve("cache", "default").binding.ownership).toBe("external");
  await registry.release();
});

test("uses deterministic test overrides instead of configured adapters", async () => {
  const values = defineEnv({ CACHE_URL: env.secret() });
  const providers: ProviderTopology = {
    cache: { default: external(redis({ url: values.CACHE_URL })) },
  };
  let configuredCreates = 0;
  let fakeCreates = 0;
  const registry = await createProviderRegistry({
    generationId: "generation-test",
    environment: "test",
    providers,
    graph: cacheGraph(),
    values: {},
    factories: {
      "cache:redis": factory("cache", "redis", () => {
        configuredCreates += 1;
        return {};
      }),
    },
    testFactories: {
      cache: factory("cache", "memory", () => {
        fakeCreates += 1;
        return { deterministic: true };
      }),
    },
  });

  expect(configuredCreates).toBe(0);
  expect(fakeCreates).toBe(1);
  expect(registry.resolve("cache", "default").value).toEqual({ deterministic: true });
  await registry.release();
});

test("rejects missing required environment values before construction", async () => {
  const values = defineEnv({ CACHE_URL: env.secret() });
  let creates = 0;
  await expect(
    createProviderRegistry({
      generationId: "generation-environment",
      environment: "production",
      providers: { cache: { default: external(redis({ url: values.CACHE_URL })) } },
      graph: cacheGraph(),
      environmentMetadata: values.metadata,
      values: {},
      factories: {
        "cache:redis": factory("cache", "redis", () => {
          creates += 1;
          return {};
        }),
      },
    }),
  ).rejects.toMatchObject({
    code: "ZSYS_PROVIDER_ENVIRONMENT_INVALID",
    issues: [{ variable: "CACHE_URL" }],
  });
  expect(creates).toBe(0);
});

function factory(
  capability: ProviderFactory["capability"],
  adapter: string,
  create: (configuration: Readonly<Record<string, unknown>>) => unknown,
): ProviderFactory {
  return {
    capability,
    adapter,
    create: (context) => ({ value: create(context.configuration) }),
  };
}

function cacheGraph(): ApplicationGraph {
  const provider: ProviderProfileNode = {
    kind: "provider",
    id: "provider.cache.default",
    source,
    capability: "cache",
    profile: "default",
    adapter: "redis",
    ownership: "external",
    configuration: {},
    environment: [],
  };
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      provider,
      { kind: "cache", id: "cache", source, key: null, value: null, profile: "default" },
    ],
    edges: [{ kind: "uses-provider-profile", from: "cache", to: provider.id }],
  };
}
