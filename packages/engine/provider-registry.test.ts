import { describe, expect, test } from "bun:test";
import { awsProviders, localProviders, testProviders, type ProviderSets } from "@zsys/app";
import { GRAPH_VERSION, type SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";
import {
  createProviderRegistry,
  type ProviderFactory,
  type ProviderGeneration,
} from "./src/provider-registry.ts";

const source: SourceLocation = { file: "src/app.ts", line: 1, column: 1 };

function providerSets(options: Parameters<typeof testProviders>[0] = {}): ProviderSets {
  return {
    development: localProviders(),
    test: testProviders(options),
    production: awsProviders({ region: "us-east-1" }),
  };
}

function cacheGraph(profile: string): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [{ kind: "cache", id: "cache", source, key: null, value: null, profile }],
    edges: [],
  };
}

function factory(
  events: string[],
  generation: ProviderGeneration = completeGeneration({ release: () => events.push("release") }),
): ProviderFactory {
  return {
    recipeTag: "test",
    create: async (context) => {
      events.push(`create:${context.environment}:${context.generationId}`);
      return generation;
    },
  };
}

function completeGeneration(generation: ProviderGeneration): ProviderGeneration {
  return {
    ...generation,
    providers: {
      buckets: { default: {} },
      cache: { default: {} },
      jobs: { default: {} },
      events: { default: {} },
      models: { default: {} },
      observability: { default: {} },
      ...generation.providers,
    },
  };
}

describe("provider registry", () => {
  test("selects one active set, constructs once, resolves profiles, and releases idempotently", async () => {
    const events: string[] = [];
    const defaultClient = Object.freeze({ name: "default-cache" });
    const archiveClient = Object.freeze({ name: "archive-cache" });
    const generation: ProviderGeneration = completeGeneration({
      providers: { cache: { default: defaultClient, archive: archiveClient } },
      readiness: () => events.push("ready"),
      release: () => events.push("release"),
    });
    const registry = await createProviderRegistry({
      generationId: "generation-1",
      environment: "test",
      providers: providerSets({ cache: { archive: {} } }),
      graph: cacheGraph("archive"),
      values: { CACHE_TOKEN: "resolved-only-at-startup" },
      factories: { test: factory(events, generation) },
    });

    expect(events).toEqual(["create:test:generation-1", "ready"]);
    expect(registry.get("cache", "archive")?.value).toBe(archiveClient);
    expect(registry.resolve("cache", "default").value).toBe(defaultClient);
    expect(registry.get("buckets", "archive")).toBeUndefined();
    await registry.release();
    await registry.dispose();
    expect(events).toEqual(["create:test:generation-1", "ready", "release"]);
  });

  test("does not collapse a named profile to a scalar default provider", async () => {
    await expect(
      createProviderRegistry({
        generationId: "generation-profile",
        environment: "test",
        providers: providerSets({ cache: { archive: {} } }),
        graph: cacheGraph("archive"),
        factories: {
          test: factory([], completeGeneration({ providers: { cache: { name: "default-only" } } })),
        },
      }),
    ).rejects.toMatchObject({ code: "ZSYS_PROVIDER_PROFILE_UNKNOWN" });
  });

  test("keeps unconfigured default capabilities when one default profile is customized", async () => {
    const providers = providerSets({ cache: { default: { maxEntries: 10 } } });
    const graph = cacheGraph("default");
    const registry = await createProviderRegistry({
      generationId: "generation-default-profile",
      environment: "test",
      providers,
      graph: {
        ...graph,
        nodes: [
          ...graph.nodes,
          { kind: "bucket", id: "assets", source, profile: "default", visibility: "private" },
        ],
      },
      factories: { test: factory([]) },
    });
    expect(registry.resolve("buckets", "default").value).toBeDefined();
    await registry.dispose();
  });

  test("rejects an unknown required profile before construction", async () => {
    let creates = 0;
    const missing = createProviderRegistry({
      generationId: "generation-2",
      environment: "test",
      providers: providerSets(),
      graph: cacheGraph("missing"),
      factories: {
        test: {
          recipeTag: "test",
          create: async () => {
            creates += 1;
            return {};
          },
        },
      },
    });

    await expect(missing).rejects.toMatchObject({ code: "ZSYS_PROVIDER_PROFILE_UNKNOWN" });
    expect(creates).toBe(0);
  });

  test("releases a constructed generation when readiness fails", async () => {
    let releases = 0;
    const readiness = createProviderRegistry({
      generationId: "generation-3",
      environment: "test",
      providers: providerSets(),
      graph: cacheGraph("default"),
      factories: {
        test: {
          recipeTag: "test",
          create: async () =>
            completeGeneration({
              ready: () => {
                throw new Error("CACHE_TOKEN=secret");
              },
              release: () => {
                releases += 1;
              },
            }),
        },
      },
    });

    await expect(readiness).rejects.toMatchObject({ code: "ZSYS_PROVIDER_READINESS_FAILED" });
    await expect(readiness).rejects.not.toThrow("CACHE_TOKEN");
    expect(releases).toBe(1);
  });
});
