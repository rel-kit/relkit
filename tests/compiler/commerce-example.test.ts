import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { hashGraph } from "../../packages/graph/src/index.ts";
import { compileProject } from "./fixture-runner.ts";

const APP_ROOT = resolve(import.meta.dir, "../../examples/commerce");

describe("commerce-example compiler acceptance", () => {
  test("compiles the canonical mixed integration topology", async () => {
    const run = await compileProject("commerce-example", APP_ROOT);
    const graph = JSON.parse(run.graphBytes) as Record<string, any>;
    const nodes = graph.nodes as readonly Record<string, any>[];
    const edges = graph.edges as readonly Record<string, any>[];

    expect(run.diagnostics).toEqual([]);
    expect(run.exitCode).toBe(0);
    expect(hashGraph(graph)).toBe(run.graphHash);
    expect(run.manifest.match(/manifestGraphHash = "([^"]+)"/)?.[1]).toBe(run.graphHash);

    const authored = run.normalization.descriptors.filter(({ identity }) => identity !== undefined);
    expect(new Set(authored.map(({ id }) => id)).size).toBe(authored.length);
    expect(authored.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "commerce-api",
        "assets.objects",
        "receipts.objects",
        "orders.prices",
        "orders.rate-limits",
        "orders.order-support",
        "route.post.orders",
      ]),
    );

    const application = nodes.find(({ kind }) => kind === "app");
    expect(application).toMatchObject({
      id: "commerce-api",
      defaults: { bucket: "assets", cache: "requests", model: "openai" },
      deploymentRoles: [
        { role: "engine", integrationId: "pulumi" },
        { role: "host", integrationId: "aws" },
      ],
      telemetry: {
        exportSampling: { traceRate: 0.25, minimumLogLevel: "info" },
        exporters: {
          errors: { integrationId: "sentry", adapterId: "sentry" },
          traces: { integrationId: "otlp", adapterId: "otlp" },
        },
      },
    });

    const providers = nodes.filter(({ kind }) => kind === "provider");
    expect(
      Object.fromEntries(providers.map(({ id, providerSource }) => [id, providerSource.kind])),
    ).toEqual({
      "provider.bucket.assets": "connected",
      "provider.bucket.receipts": "infrastructure",
      "provider.cache.requests": "connected",
      "provider.cache.timeline": "infrastructure",
      "provider.model.openai": "connected",
    });
    expect(providers.find(({ id }) => id === "provider.bucket.receipts")).toMatchObject({
      providerSource: { kind: "infrastructure", integrationId: "aws" },
      local: { integrationId: "s3", recipeId: "minio-docker" },
      deploymentRoles: [
        { role: "infrastructure", integrationId: "aws" },
        { role: "access", integrationId: "aws" },
      ],
    });
    expect(providers.find(({ id }) => id === "provider.cache.requests")).toMatchObject({
      providerSource: { kind: "connected" },
      local: { integrationId: "redis", recipeId: "redis-docker" },
      namedValues: [{ field: "url", name: "REQUESTS_REDIS_URL", sensitive: true }],
    });

    expect(
      edges
        .filter(({ kind }) => kind === "uses-provider-profile")
        .map(({ from, to }) => [from, to]),
    ).toEqual([
      ["assets.objects", "provider.bucket.assets"],
      ["orders.order-support", "provider.model.openai"],
      ["orders.prices", "provider.cache.requests"],
      ["orders.rate-limits", "provider.cache.timeline"],
      ["receipts.objects", "provider.bucket.receipts"],
    ]);
    expect(nodes.find(({ id }) => id === "route.post.orders")?.config.rateLimit).toEqual({
      key: { kind: "header", name: "x-customer-email" },
      limit: 20,
      storeId: "orders.rate-limits",
      windowMs: 60_000,
    });

    const local = JSON.parse(run.normalization.outputs.localServices);
    expect(
      local.services.map(({ bindingId }: { readonly bindingId: string }) => bindingId),
    ).toEqual([
      "provider.bucket.assets",
      "provider.bucket.receipts",
      "provider.cache.requests",
      "provider.cache.timeline",
    ]);
    const runtime = JSON.parse(run.normalization.outputs.runtimeIntegrations);
    expect(
      runtime.integrations.map(({ packageName }: { readonly packageName: string }) => packageName),
    ).toEqual(["@relkit/s3", "@relkit/redis", "@relkit/ai-sdk", "@relkit/otlp", "@relkit/sentry"]);

    expect(run.manifest).toContain('from "@relkit/app";');
    expect(run.manifest).not.toMatch(/from "@relkit\/(?:agents|events|invocation)"/);
    expect(run.manifest).not.toContain("providerFactories");
    expect(run.graphBytes).not.toContain("relkit-synthetic-openai-secret");
    assertDataOnly(graph, run.manifest);
  });
});

function assertDataOnly(graph: unknown, manifest: string): void {
  walk(graph, (key, value) => {
    if (key === "source" && isRecord(value) && absolute(value.file)) {
      throw new Error(`absolute source path: ${String(value.file)}`);
    }
    if ((/client/i.test(key) || key === "handler") && typeof value === "function") {
      throw new Error(`executable value at ${key}`);
    }
  });
  expect(manifest).not.toContain("/Users/");
  expect(manifest).not.toContain("[Function");
}

function walk(value: unknown, visit: (key: string, value: unknown) => void, key = ""): void {
  visit(key, value);
  if (Array.isArray(value)) return void value.forEach((entry) => walk(entry, visit, key));
  if (!isRecord(value)) return;
  for (const [childKey, child] of Object.entries(value)) walk(child, visit, childKey);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function absolute(value: unknown): boolean {
  return typeof value === "string" && (/^\//.test(value) || /^[A-Za-z]:[\\/]/.test(value));
}
