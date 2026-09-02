import { describe, expect, test } from "bun:test";
import { defineApp } from "../../packages/app/src/define-app.ts";
import { defineEnv, env } from "../../packages/config/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { defineAgent } from "../../packages/agents/src/index.ts";
import { defineBucket } from "../../packages/buckets/src/index.ts";
import {
  defineInfrastructureProviderSource,
  defineIntegrationReference,
  defineProviderAccess,
} from "../../packages/provider/src/index.ts";
import { defineRoute, defineTransform, http } from "../../packages/routes/src/index.ts";
import { z, type StandardSchemaV1 } from "../../packages/schema/src/index.ts";
import {
  NORMALIZE_CODES,
  normalizeCompilation as normalize,
} from "../../packages/compiler/src/index.ts";
import { aiSdk } from "../../integrations/packages/ai-sdk/src/index.ts";
import { docker } from "../../integrations/packages/docker/src/index.ts";
import { redis } from "../../integrations/packages/redis/src/index.ts";
import { s3 } from "../../integrations/packages/s3/src/index.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });

function normalizeCompilation(input: Parameters<typeof normalize>[0] = {}) {
  return normalize({
    ...input,
    runtimeIntegrationPackages: [
      runtimePackage("ai-sdk"),
      runtimePackage("redis"),
      runtimePackage("s3"),
    ],
  });
}

function codes(result: ReturnType<typeof normalizeCompilation>): readonly string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("compiler semantic validation", () => {
  test("resolves agent model profiles without a legacy model registry", () => {
    const app = defineApp({
      id: "app",
      env: defineEnv({}),
      model: {
        openai: aiSdk({
          provider: "openai",
          defaultModel: "gpt-5-mini",
          apiKey: env.secret("OPENAI_API_KEY"),
        }),
        anthropic: aiSdk({
          provider: "anthropic",
          defaultModel: "claude-sonnet-4-5",
          apiKey: env.secret("ANTHROPIC_API_KEY"),
        }),
      },
      defaults: { model: "openai" },
    });
    const agent = (model?: string) =>
      defineAgent({
        id: "support.agent",
        input: z.string(),
        output: z.string(),
        ...(model === undefined ? {} : { model }),
        instructions: "Answer safely.",
        tools: [],
        limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
      });
    expect(codes(normalizeCompilation({ descriptors: [app, agent()] }))).not.toContain(
      NORMALIZE_CODES.providerProfile,
    );
    expect(codes(normalizeCompilation({ descriptors: [app, agent("missing")] }))).toContain(
      NORMALIZE_CODES.providerProfile,
    );
    expect(codes(normalizeCompilation({ descriptors: [app, agent("anthropic")] }))).not.toContain(
      NORMALIZE_CODES.providerProfile,
    );
    expect(
      codes(normalizeCompilation({ descriptors: [app, agent("openai:gpt-4.1")] })),
    ).not.toContain(NORMALIZE_CODES.providerProfile);
  });

  test("indexes middleware and transforms without duplicating exported references", () => {
    const target = defineFunction({
      id: "orders.get",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const transform = defineTransform({ id: "orders.id", schema: z.string() });
    const middleware = {
      kind: "middleware",
      id: "orders.auth",
      ref: { kind: "middleware", id: "orders.auth" },
      path: "/orders/*",
      handler: async () => undefined,
    };
    const route = defineRoute({
      id: "orders.route",
      method: "GET",
      path: "/orders/:id",
      target,
      request: http.input({ id: http.transform(transform, http.path("id")) }),
      responses: [http.success(200, output)],
    });

    const result = normalizeCompilation({ descriptors: [target, transform, middleware, route] });

    expect(result.diagnostics).toEqual([]);
    expect(result.references.get("orders.auth")?.kind).toBe("middleware");
    expect(result.references.get("orders.id")?.kind).toBe("transform");
  });

  test("reports missing references, response incompatibility, and transform collisions", () => {
    const missing = normalizeCompilation({
      descriptors: [
        {
          kind: "route",
          id: "missing.route",
          method: "GET",
          path: "/missing/:id",
          target: { ref: { kind: "function", id: "missing.function" } },
          request: http.input({ id: http.transform("missing.transform", http.path("id")) }),
          responses: [http.success(200, output)],
        },
      ],
    });
    expect(codes(missing)).toEqual(
      expect.arrayContaining([NORMALIZE_CODES.missingTarget, NORMALIZE_CODES.missingTransform]),
    );

    const target = defineFunction({
      id: "orders.target",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const badRoute = defineRoute({
      id: "orders.bad-route",
      method: "GET",
      path: "/orders",
      target,
      request: http.input({ id: http.query("id") }),
      responses: [http.success(200, z.string())],
    });
    const incompatible = normalizeCompilation({ descriptors: [target, badRoute] });
    expect(codes(incompatible)).toContain(NORMALIZE_CODES.response);

    const first = defineTransform({ id: "orders.same", schema: z.string() });
    const second = defineTransform({ id: "orders.same", schema: z.number() });
    expect(codes(normalizeCompilation({ descriptors: [first, second] }))).toContain(
      NORMALIZE_CODES.transformCollision,
    );
  });

  test("validates provider capabilities without static function cycles", () => {
    const target = defineFunction({
      id: "events.target",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const app = defineApp({
      id: "app",
      env: defineEnv({}),
      bucket: { archive: connectedS3() },
    });
    const cache = {
      kind: "cache",
      id: "orders.cache",
      ref: { kind: "cache", id: "orders.cache" },
      profile: "archive",
      key: z.string(),
      value: z.string(),
    };
    const result = normalizeCompilation({
      descriptors: [app, cache, target],
    });
    expect(codes(result)).toEqual(expect.arrayContaining([NORMALIZE_CODES.providerProfile]));
  });

  test("rejects multiple bucket descriptors owning one profile", () => {
    const app = defineApp({ id: "app", env: defineEnv({}), bucket: connectedS3() });
    const first = defineBucket({ id: "assets.primary", profile: "default", visibility: "private" });
    const second = defineBucket({
      id: "assets.secondary",
      profile: "default",
      visibility: "private",
    });
    const result = normalizeCompilation({ descriptors: [app, first, second] });

    expect(codes(result)).toContain(NORMALIZE_CODES.bucketProfileDuplicate);
    expect(
      result.diagnostics.find(
        (diagnostic) => diagnostic.code === NORMALIZE_CODES.bucketProfileDuplicate,
      ),
    ).toMatchObject({ descriptorId: "assets.secondary" });
  });

  test("projects provider sources, integrations, named values, recipes, and deployment roles", () => {
    const infrastructure = defineInfrastructureProviderSource(
      s3(),
      defineIntegrationReference("aws"),
      { versioning: true },
      defineProviderAccess({ actions: ["s3:GetObject"] }),
    );
    const app = defineApp({
      id: "app",
      env: defineEnv({}),
      bucket: { assets: infrastructure },
      cache: { requests: docker(redis({ url: env.secret("CACHE_URL") })) },
      deployment: { engine: "pulumi", host: "aws" },
    });
    const bucket = defineBucket({ id: "assets", profile: "assets", visibility: "private" });
    const result = normalizeCompilation({ descriptors: [app, bucket] });

    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes.find((node) => node.id === "app")).toMatchObject({
      deploymentRoles: [
        { role: "engine", integrationId: "pulumi", protocolVersion: 1, configuration: {} },
        { role: "host", integrationId: "aws", protocolVersion: 1, configuration: {} },
      ],
    });
    expect(result.graph?.nodes.find((node) => node.id === "provider.bucket.assets")).toMatchObject({
      kind: "provider",
      capability: "bucket",
      profile: "assets",
      adapter: {
        integrationId: "s3",
        adapterId: "s3",
        protocolVersion: 1,
        features: ["signedReadUrl", "signedWriteUrl"],
      },
      providerSource: {
        kind: "infrastructure",
        integrationId: "aws",
        options: { versioning: true },
      },
      local: { integrationId: "s3", recipeId: "minio-docker", recipeVersion: 1 },
      access: { actions: ["s3:GetObject"] },
      deploymentRoles: [
        {
          role: "infrastructure",
          integrationId: "aws",
          protocolVersion: 1,
          configuration: { versioning: true },
        },
        {
          role: "access",
          integrationId: "aws",
          protocolVersion: 1,
          configuration: { actions: ["s3:GetObject"] },
        },
      ],
    });
    expect(result.graph?.nodes.find((node) => node.id === "provider.cache.requests")).toMatchObject(
      {
        providerSource: { kind: "connected" },
        adapter: { integrationId: "redis", adapterId: "redis", connection: {} },
        namedValues: [{ field: "url", name: "CACHE_URL", type: "secret-string", sensitive: true }],
        local: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
      },
    );
    expect(result.graph?.edges).toContainEqual({
      kind: "uses-provider-profile",
      from: "assets",
      to: "provider.bucket.assets",
    });
    expect(JSON.stringify(result.graph)).not.toContain("ownership");
  });

  test("rejects local-only provider bindings in production", () => {
    const app = defineApp({
      id: "app",
      env: defineEnv({}),
      cache: docker(redis()),
    });

    const development = normalizeCompilation({ descriptors: [app], mode: "development" });
    const production = normalizeCompilation({ descriptors: [app], mode: "production" });

    expect(codes(development)).not.toContain(NORMALIZE_CODES.providerReleaseSource);
    expect(production.diagnostics).toContainEqual(
      expect.objectContaining({
        code: NORMALIZE_CODES.providerReleaseSource,
        descriptorId: "app",
        message: expect.stringContaining("provider.cache.default"),
      }),
    );
  });
});

function connectedS3() {
  return s3({
    endpoint: "https://s3.example.com",
    bucketName: "assets",
    region: "us-east-1",
  });
}

function runtimePackage(integrationId: string) {
  const capability =
    integrationId === "ai-sdk" ? "model" : integrationId === "s3" ? "bucket" : "cache";
  return {
    integrationId,
    packageName: `@relkit/${integrationId}`,
    packageVersion: "0.1.0",
    exportName: "./runtime",
    registrations: [{ capability, adapterId: integrationId, protocolVersion: 1 }],
  };
}
