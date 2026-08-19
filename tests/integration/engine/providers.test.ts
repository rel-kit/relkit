import { describe, expect, test } from "bun:test";
import { Effect } from "../../../packages/testing/node_modules/effect/dist/index.js";
import { defineEnv, env, resolveEnv } from "../../../packages/config/src/index.ts";
import {
  localProviders,
  testProviders,
  awsProviders,
  type ProviderSets,
} from "../../../packages/app/src/index.ts";
import { defineFunction } from "../../../packages/functions/src/index.ts";
import { defineCache } from "../../../packages/cache/src/index.ts";
import {
  createGenerationRuntime,
  type GenerationRuntimeOptions,
  type GenerationServiceDefinition,
  type RuntimeManifest,
} from "../../../packages/runtime-effect/src/index.ts";
import {
  createProviderRegistry,
  type ProviderFactory,
  type ProviderGeneration,
} from "../../../packages/engine/src/index.ts";
import { createTestRuntime } from "../../../packages/testing/src/index.ts";
import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  type SourceLocation,
} from "../../../packages/contracts/src/index.ts";
import {
  hashGraph,
  type ApplicationGraph,
  type GraphEdge,
  type ObservedEdge,
} from "../../../packages/graph/src/index.ts";
import { z } from "../../../packages/schema/src/index.ts";

const source: SourceLocation = { file: "src/app.ts", line: 1, column: 1 };

function providerSets(options: Parameters<typeof testProviders>[0] = {}): ProviderSets {
  return {
    development: localProviders(),
    test: testProviders(options),
    production: awsProviders({ region: "us-east-1" }),
  };
}

function cacheGraph(profiles: readonly string[]): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: profiles.map((profile) => ({
      kind: "cache" as const,
      id: `cache.${profile}`,
      source,
      key: null,
      value: null,
      profile,
    })),
    edges: [],
  };
}

const runtimeGraph: ApplicationGraph = {
  contractVersion: GRAPH_VERSION,
  nodes: [],
  edges: [],
};

const runtimeManifest: RuntimeManifest = {
  contractVersion: MANIFEST_VERSION,
  generatorVersion: GENERATOR_VERSION,
  graphHash: "integration-runtime",
  functions: {},
  providers: {},
  middleware: {},
  requestTransforms: {},
};

function runtimeOptions(
  services: readonly GenerationServiceDefinition[],
  environment = defineEnv({}),
  sourceValues: Readonly<Record<string, string | undefined>> = {},
): GenerationRuntimeOptions {
  return {
    environment: "test",
    env: environment,
    source: sourceValues,
    graph: runtimeGraph,
    graphHash: runtimeManifest.graphHash,
    manifest: runtimeManifest,
    services,
  };
}

function service(
  id: string,
  events: string[],
  dependencies?: readonly string[],
): GenerationServiceDefinition<string> {
  return {
    id,
    ...(dependencies === undefined ? {} : { dependencies }),
    acquire: () =>
      Effect.sync(() => {
        events.push(`acquire:${id}`);
        return id;
      }),
    release: () => Effect.sync(() => events.push(`release:${id}`)),
  };
}

describe("provider and generation integration", () => {
  test("resolves the active environment and profiles with one provider instance per generation", async () => {
    const definition = defineEnv({ providerToken: env.string().requiredIn("test") });
    const resolved = resolveEnv(definition, {
      environment: "test",
      source: { providerToken: "resolved-at-startup" },
    });
    const generation = await createGenerationRuntime(
      runtimeOptions([], definition, { providerToken: "resolved-at-startup" }),
    );
    const created: object[] = [];
    const contexts: Array<{ environment: string; values?: Readonly<Record<string, unknown>> }> = [];
    const factory: ProviderFactory = {
      recipeTag: "test",
      create: async (context) => {
        contexts.push({
          environment: context.environment,
          ...(context.values === undefined ? {} : { values: context.values }),
        });
        const value = Object.freeze({ generationId: context.generationId, profile: "default" });
        const archive = Object.freeze({ generationId: context.generationId, profile: "archive" });
        created.push(value);
        return {
          providers: {
            buckets: { default: {} },
            cache: { default: value, archive },
            jobs: { default: {} },
            events: { default: {} },
            models: { default: {} },
            observability: { default: {} },
          },
        } satisfies ProviderGeneration;
      },
    };
    const providers = providerSets({ cache: { archive: {} } });
    const graph = cacheGraph(["default", "archive"]);
    let first: Awaited<ReturnType<typeof createProviderRegistry>> | undefined;
    let second: Awaited<ReturnType<typeof createProviderRegistry>> | undefined;

    try {
      expect(generation.environment).toEqual(resolved);
      first = await createProviderRegistry({
        generationId: "generation-one",
        environment: "test",
        providers,
        graph,
        values: generation.environment,
        factories: { test: factory },
      });
      second = await createProviderRegistry({
        generationId: "generation-two",
        environment: "test",
        providers,
        graph,
        values: generation.environment,
        factories: { test: factory },
      });

      expect(contexts).toEqual([
        { environment: "test", values: { providerToken: "resolved-at-startup" } },
        { environment: "test", values: { providerToken: "resolved-at-startup" } },
      ]);
      expect(created).toHaveLength(2);
      expect(first.resolve("cache", "default").value).not.toBe(
        first.resolve("cache", "archive").value,
      );
      expect(second.resolve("cache", "default").value).not.toBe(
        second.resolve("cache", "archive").value,
      );
      expect(first.resolve("cache", "default").value).not.toBe(
        second.resolve("cache", "default").value,
      );
    } finally {
      await second?.release();
      await first?.release();
      await generation.dispose();
    }
  });

  test("reports an unknown profile before constructing providers", async () => {
    let creates = 0;
    const failure = await createProviderRegistry({
      generationId: "generation-missing-profile",
      environment: "test",
      providers: providerSets(),
      graph: cacheGraph(["missing"]),
      factories: {
        test: {
          recipeTag: "test",
          create: async () => {
            creates += 1;
            return {};
          },
        },
      },
    }).catch((error) => error as { readonly code?: string; readonly issues?: readonly unknown[] });

    expect(failure).toMatchObject({
      code: "ZSYS_PROVIDER_PROFILE_UNKNOWN",
      issues: [
        {
          capability: "cache",
          profile: "missing",
          source,
        },
      ],
    });
    expect(creates).toBe(0);
  });

  test("cleans provider construction and readiness failures", async () => {
    const construction = await createProviderRegistry({
      generationId: "generation-construction-failure",
      environment: "test",
      providers: providerSets(),
      graph: cacheGraph(["default"]),
      factories: {
        test: {
          recipeTag: "test",
          create: async () => {
            throw new Error("construction-secret");
          },
        },
      },
    }).catch((error) => error as { readonly code?: string; readonly message?: string });
    expect(construction).toMatchObject({
      code: "ZSYS_PROVIDER_CONSTRUCTION_FAILED",
      message: "ZSYS_PROVIDER_CONSTRUCTION_FAILED: Provider construction failed.",
    });
    expect(construction.message).not.toContain("construction-secret");

    const events: string[] = [];
    const readiness = await createProviderRegistry({
      generationId: "generation-readiness-failure",
      environment: "test",
      providers: providerSets(),
      graph: cacheGraph(["default"]),
      factories: {
        test: {
          recipeTag: "test",
          create: async () => ({
            providers: {
              buckets: { default: {} },
              cache: { default: {} },
              jobs: { default: {} },
              events: { default: {} },
              models: { default: {} },
              observability: { default: {} },
            },
            readiness: () => {
              events.push("readiness");
              throw new Error("readiness-secret");
            },
            release: () => events.push("release"),
          }),
        },
      },
    }).catch((error) => error as { readonly code?: string; readonly message?: string });
    expect(readiness).toMatchObject({ code: "ZSYS_PROVIDER_READINESS_FAILED" });
    expect(readiness.message).not.toContain("readiness-secret");
    expect(events).toEqual(["readiness", "release"]);
  });

  test("keeps named provider startup and shutdown failures observable and ordered", async () => {
    const startEvents: string[] = [];
    await expect(
      createGenerationRuntime(
        runtimeOptions([
          service("config", startEvents),
          {
            id: "provider",
            dependencies: ["config"],
            acquire: () => {
              startEvents.push("acquire:provider");
              return Effect.fail(new Error("runtime.during-provider-start"));
            },
          },
        ]),
      ),
    ).rejects.toThrow("runtime.during-provider-start");
    expect(startEvents).toEqual(["acquire:config", "acquire:provider", "release:config"]);

    const shutdownEvents: string[] = [];
    const generation = await createGenerationRuntime(
      runtimeOptions([
        service("config", shutdownEvents),
        {
          id: "provider",
          dependencies: ["config"],
          acquire: () =>
            Effect.sync(() => {
              shutdownEvents.push("acquire:provider");
              return "provider";
            }),
          release: () =>
            Effect.sync(() => {
              shutdownEvents.push("release:provider");
              throw new Error("runtime.during-provider-shutdown");
            }),
        },
      ]),
    );
    await expect(generation.dispose()).rejects.toThrow("runtime.during-provider-shutdown");
    expect(shutdownEvents).toEqual([
      "acquire:config",
      "acquire:provider",
      "release:provider",
      "release:config",
    ]);
  });

  test("enforces declared dependencies and keeps observed edges outside the graph", async () => {
    const cache = defineCache({ id: "prices", key: z.string(), value: z.number() });
    const target = defineFunction({
      id: "orders.total",
      input: z.object({}),
      output: z.object({ value: z.number() }),
      dependencies: { cache: { prices: cache } },
      handler: async (_input, context) => {
        await context.cache.prices.set("sku-1", 42);
        return { value: (await context.cache.prices.get("sku-1")) ?? 0 };
      },
    });
    const graph: ApplicationGraph = {
      contractVersion: GRAPH_VERSION,
      nodes: [
        { kind: "function", id: target.id, source, input: null, output: null },
        { kind: "cache", id: cache.id, source, key: null, value: null, profile: "default" },
      ],
      edges: [{ kind: "uses-cache", from: target.id, to: cache.id }],
    };
    const graphHash = hashGraph(graph);
    const declared: GraphEdge[] = [];
    const observed: ObservedEdge[] = [];
    const runtime = createTestRuntime();
    runtime.fakes.createCache("prices");

    try {
      await expect(
        runtime.invoke(
          target,
          {},
          {
            hooks: {
              onDeclaredEdge: (edge) => declared.push(edge),
              onObservedEdge: (edge) => observed.push(edge),
            },
          },
        ),
      ).resolves.toEqual({ value: 42 });
      expect(declared).toEqual([{ kind: "uses-cache", from: target.id, to: cache.id }]);
      expect(observed).toEqual([
        { relationship: "uses-cache", from: target.id, to: cache.id },
        { relationship: "uses-cache", from: target.id, to: cache.id },
      ]);
      expect(hashGraph(graph)).toBe(graphHash);

      const undeclared = defineFunction({
        id: "orders.undeclared",
        input: z.object({}),
        output: z.object({ value: z.number() }),
        handler: async (_input, context) => {
          const forged = context as unknown as {
            readonly cache: { readonly prices: { readonly get: (key: string) => Promise<number> } };
          };
          return { value: (await forged.cache.prices.get("sku-1")) ?? 0 };
        },
      });
      const failure = await runtime
        .invoke(undeclared, {})
        .catch((error) => error as { readonly kind?: string });
      expect(failure.kind).toBe("defect");
      expect(observed).toHaveLength(2);
      expect(hashGraph(graph)).toBe(graphHash);
    } finally {
      await runtime.close();
    }
  });
});
