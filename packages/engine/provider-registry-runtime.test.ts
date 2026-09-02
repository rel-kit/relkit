import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph, GraphNode, ProviderBindingNode } from "@relkit/graph";
import type {
  RuntimeProviderContext,
  RuntimeProviderGeneration,
  RuntimeProviderRegistration,
} from "@relkit/provider";
import { createProviderRegistry } from "./src/provider-registry.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

test("constructs each required graph binding once and ignores unused configuration", async () => {
  const cache = provider("cache", "default", true);
  const unused = provider("bucket", "unused", true);
  const contexts: RuntimeProviderContext[] = [];
  let unusedCreates = 0;
  const registry = await createProviderRegistry({
    generationId: "generation.required",
    graph: graph([cache, unused], [cache, cache]),
    runtimeIntegrationModules: modules([
      registration("cache", "redis", (context) => {
        contexts.push(context);
        return { value: { cache: true } };
      }),
      registration("bucket", "s3", () => {
        unusedCreates += 1;
        return { value: {} };
      }),
    ]),
    bindingValues: { CACHE_URL: "redis://configured" },
  });

  expect(contexts).toHaveLength(1);
  expect(contexts[0]).toMatchObject({
    bindingId: cache.id,
    capability: "cache",
    profile: "default",
    connection: { url: "redis://configured" },
  });
  expect(unusedCreates).toBe(0);
  expect(registry.requirements.map(({ bindingId }) => bindingId)).toEqual([cache.id]);
  expect(registry.resolve("cache", "default").binding).toBe(cache);
  await registry.release();
});

test("keeps cache, bucket, job, event, and model profiles independent", async () => {
  const required = [
    provider("cache", "requests"),
    provider("bucket", "assets"),
    provider("job", "worker"),
    provider("event", "bus"),
    provider("model", "primary"),
    provider("model", "secondary"),
  ];
  const unused = provider("event", "unused", true);
  const constructed: string[] = [];
  const models: string[] = [];
  const registrations = ["cache", "job", "event", "model"].map((capability) =>
    registration(capability, "redis", (context) => {
      constructed.push(`${context.capability}.${context.profile}`);
      return {
        value:
          context.capability === "model"
            ? {
                resolveModel: (selector?: string) => {
                  models.push(`${context.profile}:${selector}`);
                  return { id: selector ?? context.profile, model: {} };
                },
              }
            : { profile: context.profile },
      };
    }),
  );
  registrations.push(
    registration("bucket", "s3", (context) => {
      constructed.push(`${context.capability}.${context.profile}`);
      return { value: { profile: context.profile } };
    }),
  );

  const registry = await createProviderRegistry({
    generationId: "generation.profiles",
    graph: graph([...required, unused], required),
    runtimeIntegrationModules: modules(registrations),
  });

  expect(constructed.sort()).toEqual([
    "bucket.assets",
    "cache.requests",
    "event.bus",
    "job.worker",
    "model.primary",
    "model.secondary",
  ]);
  expect(models.sort()).toEqual(["primary:primary:test", "secondary:secondary:test"]);
  for (const binding of required) {
    expect(registry.resolve(binding.capability, binding.profile).binding).toBe(binding);
  }
  expect(registry.get("event", "unused")).toBeUndefined();
  await registry.release();
});

test("rejects a provider edge whose profile differs from its consumer", async () => {
  const binding = provider("cache", "requests");
  const valid = graph([binding], [binding]);
  const invalid: ApplicationGraph = {
    ...valid,
    nodes: valid.nodes.map((node, index) =>
      index === 1 ? ({ ...node, profile: "timeline" } as GraphNode) : node,
    ),
  };

  await expect(
    createProviderRegistry({
      generationId: "generation.profile-mismatch",
      graph: invalid,
      runtimeIntegrationModules: modules([]),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_PROVIDER_METADATA_INVALID" });
});

test("rejects duplicate required capability profiles", async () => {
  const first = provider("cache", "requests");
  const second = { ...provider("cache", "requests"), id: "provider.cache.requests.duplicate" };

  await expect(
    createProviderRegistry({
      generationId: "generation.duplicate-profile",
      graph: graph([first, second], [first, second]),
      runtimeIntegrationModules: modules([]),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_PROVIDER_METADATA_INVALID" });
});

test("isolates binding values and lifecycle across concurrent applications", async () => {
  const binding = provider("cache", "shared", true);
  const started: string[] = [];
  const released: string[] = [];
  const gate = Promise.withResolvers<void>();
  const runtimeIntegrationModules = modules([
    registration("cache", "redis", async (context) => {
      started.push(context.generationId);
      if (started.length === 2) gate.resolve();
      await gate.promise;
      return {
        value: context.connection.url,
        release: () => released.push(context.generationId),
      };
    }),
  ]);
  const applicationGraph = graph([binding], [binding]);
  const [first, second] = await Promise.all([
    createProviderRegistry({
      generationId: "generation.concurrent.first",
      graph: applicationGraph,
      runtimeIntegrationModules,
      bindingValues: { CACHE_URL: "redis://first" },
    }),
    createProviderRegistry({
      generationId: "generation.concurrent.second",
      graph: applicationGraph,
      runtimeIntegrationModules,
      bindingValues: { CACHE_URL: "redis://second" },
    }),
  ]);

  expect(first.resolve("cache", "shared").value).toBe("redis://first");
  expect(second.resolve("cache", "shared").value).toBe("redis://second");
  await Promise.all([first.release(), second.release()]);
  expect(released.sort()).toEqual(["generation.concurrent.first", "generation.concurrent.second"]);
});

test("runs readiness once and releases constructed bindings in reverse order", async () => {
  const first = provider("cache", "first");
  const second = provider("cache", "second");
  const lifecycle: string[] = [];
  const registry = await createProviderRegistry({
    generationId: "generation.lifecycle",
    graph: graph([second, first], [second, first]),
    runtimeIntegrationModules: modules([
      registration("cache", "redis", ({ bindingId }) => ({
        value: {},
        ready: () => lifecycle.push(`ready:${bindingId}`),
        release: () => lifecycle.push(`release:${bindingId}`),
      })),
    ]),
  });

  await registry.release();
  await registry.release();
  expect(lifecycle).toEqual([
    `ready:${first.id}`,
    `ready:${second.id}`,
    `release:${second.id}`,
    `release:${first.id}`,
  ]);
});

test("replaces only the explicitly named capability and profile", async () => {
  const replaced = provider("cache", "replaced");
  const configured = provider("cache", "configured");
  const created: string[] = [];
  const registry = await createProviderRegistry({
    generationId: "generation.replacements",
    graph: graph([replaced, configured], [replaced, configured]),
    runtimeIntegrationModules: modules([
      registration("cache", "redis", ({ bindingId }) => {
        created.push(bindingId);
        return { value: { real: bindingId } };
      }),
    ]),
    replacements: {
      cache: { replaced: { value: { fake: true } } },
    },
  });

  expect(registry.resolve("cache", "replaced").value).toEqual({ fake: true });
  expect(registry.resolve("cache", "configured").value).toEqual({ real: configured.id });
  expect(created).toEqual([configured.id]);
  await registry.release();
});

test("cleans up a readiness failure without exposing its cause", async () => {
  const first = provider("cache", "first");
  const second = provider("cache", "second");
  const released: string[] = [];
  let failure: unknown;
  try {
    await createProviderRegistry({
      generationId: "generation.failure",
      graph: graph([first, second], [first, second]),
      runtimeIntegrationModules: modules([
        registration("cache", "redis", ({ bindingId }) => ({
          value: {},
          ready: () => {
            if (bindingId === second.id) throw new Error("synthetic-secret-readiness");
          },
          release: () => released.push(bindingId),
        })),
      ]),
    });
  } catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({ code: "RELKIT_PROVIDER_READINESS_FAILED" });
  expect(String(failure)).not.toContain("synthetic-secret-readiness");
  expect(JSON.stringify(failure)).not.toContain("synthetic-secret-readiness");
  expect(released).toEqual([second.id, first.id]);
});

test("reports release failure without exposing integration details", async () => {
  const binding = provider("cache", "release");
  const registry = await createProviderRegistry({
    generationId: "generation.release-failure",
    graph: graph([binding], [binding]),
    runtimeIntegrationModules: modules([
      registration("cache", "redis", () => ({
        value: {},
        release: () => {
          throw new Error("synthetic-secret-release");
        },
      })),
    ]),
  });

  let failure: unknown;
  try {
    await registry.release();
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ code: "RELKIT_PROVIDER_RELEASE_FAILED" });
  expect(String(failure)).not.toContain("synthetic-secret-release");
});

function graph(
  providers: readonly ProviderBindingNode[],
  required: readonly ProviderBindingNode[],
): ApplicationGraph {
  const consumers = required.map(logicalNode);
  return {
    contractVersion: GRAPH_VERSION,
    appId: "registry-test",
    nodes: [...providers, ...consumers],
    edges: consumers.map((consumer, index) => ({
      kind: "uses-provider-profile" as const,
      from: consumer.id,
      to: required[index]!.id,
    })),
  };
}

function logicalNode(binding: ProviderBindingNode, index: number): GraphNode {
  const base = { id: `${binding.capability}.${index}`, source, profile: binding.profile };
  switch (binding.capability) {
    case "bucket":
      return { ...base, kind: "bucket", visibility: "private" };
    case "cache":
      return { ...base, kind: "cache", key: null, value: null };
    case "job":
      return { ...base, kind: "job", input: null, targetFunctionId: "jobs.target" };
    case "event":
      return { ...base, kind: "event", version: 1, input: null };
    case "model":
      return {
        ...base,
        kind: "agent",
        input: null,
        output: null,
        model: `${binding.profile}:test`,
        instructions: null,
        toolIds: [],
        limits: {},
        generatedFunction: {
          generated: true,
          generatedBy: "agent",
          agentId: base.id,
          functionId: `relkit.agent.${base.id}.invoke`,
        },
      };
    case "observability":
      throw new Error("Observability has no logical profile consumer in this runtime cohort");
  }
}

function provider(
  capability: ProviderBindingNode["capability"],
  profile: string,
  named = false,
): ProviderBindingNode {
  return {
    kind: "provider",
    id: `provider.${capability}.${profile}`,
    source,
    capability,
    profile,
    adapter: {
      integrationId: "test",
      adapterId: capability === "bucket" ? "s3" : "redis",
      protocolVersion: 1,
      behavior: {},
      connectionContract: named
        ? { url: { required: true, sensitive: true, authoredValue: "fallback" } }
        : {},
      connection: {},
      features: [],
    },
    providerSource: { kind: "connected" },
    namedValues: named
      ? [
          {
            field: "url",
            name: capability === "bucket" ? "BUCKET_URL" : "CACHE_URL",
            type: "secret-string",
            sensitive: true,
          },
        ]
      : [],
    deploymentRoles: [],
  };
}

function registration(
  capability: string,
  adapterId: string,
  create: (
    context: RuntimeProviderContext,
  ) => RuntimeProviderGeneration | Promise<RuntimeProviderGeneration>,
): RuntimeProviderRegistration {
  return { capability, adapterId, protocolVersion: 1, create };
}

function modules(registrations: readonly RuntimeProviderRegistration[]) {
  return [
    {
      packageName: "@relkit/test-integration",
      packageVersion: "0.1.0",
      exportName: "./runtime",
      module: {
        runtimeIntegration: {
          kind: "runtime-integration",
          integrationId: "test",
          registrations,
        },
      },
    },
  ];
}
