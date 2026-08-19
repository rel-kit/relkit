import { expect, test } from "bun:test";
import { awsProviders, localProviders, testProviders, type ProviderSets } from "@zsys/app";
import { GRAPH_VERSION, type SourceLocation } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";
import { createProviderRegistry, type ProviderGeneration } from "./src/provider-registry.ts";

const source: SourceLocation = { file: "src/app.ts", line: 1, column: 1 };

test("does not collapse a named-only provider map to the default provider", async () => {
  const events: string[] = [];
  await expect(
    createProviderRegistry({
      generationId: "generation-named-only",
      environment: "test",
      providers: providerSets({ cache: { archive: {} } }),
      graph: cacheGraph("default"),
      factories: {
        test: {
          recipeTag: "test",
          create: async (context) => {
            events.push(`create:${context.generationId}`);
            return completeGeneration({
              providers: { cache: { archive: {} } },
              release: () => events.push("release"),
            });
          },
        },
      },
    }),
  ).rejects.toMatchObject({ code: "ZSYS_PROVIDER_PROFILE_UNKNOWN" });
  expect(events).toEqual(["create:generation-named-only", "release"]);
});

test("rejects missing required environment values before construction", async () => {
  let creates = 0;
  await expect(
    createProviderRegistry({
      generationId: "generation-environment",
      environment: "production",
      providers: providerSets(),
      graph: cacheGraph("default"),
      environmentMetadata: {
        OPENAI_API_KEY: {
          type: "secret-string",
          requiredIn: ["production"],
          hasDefault: false,
          optional: false,
          sensitive: true,
        },
      },
      values: {},
      factories: {
        aws: {
          recipeTag: "aws",
          create: async () => {
            creates += 1;
            return completeGeneration({});
          },
        },
      },
    }),
  ).rejects.toMatchObject({
    code: "ZSYS_PROVIDER_ENVIRONMENT_INVALID",
    issues: [{ variable: "OPENAI_API_KEY" }],
  });
  expect(creates).toBe(0);
});

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
