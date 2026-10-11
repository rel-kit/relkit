/**
 * Asserts canonical commerce graph projections from the compiler-owned precise
 * graph contract. These pure checks inspect metadata without opening providers
 * or evaluating executable runtime modules.
 */
import { expect } from "bun:test";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";

/**
 * Verifies application deployment and telemetry metadata.
 * @param graph - Complete accepted commerce graph.
 * @returns Completion when the declared app metadata is preserved.
 */
export function assertCommerceApplication(graph: ApplicationGraph): void {
  const application = graph.nodes.find((node) => node.kind === "app");
  expect(application).toMatchObject({
    id: "commerce-api",
    defaults: { bucket: "assets", cache: "requests" },
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
}

/**
 * Verifies provider provenance and named secret contracts remain data only.
 * @param graph - Complete accepted commerce graph.
 * @returns Completion when connected/infrastructure/local mappings agree.
 */
export function assertCommerceProviders(graph: ApplicationGraph): void {
  const providers = graph.nodes.filter((node) => node.kind === "provider");
  expect(
    Object.fromEntries(providers.map(({ id, providerSource }) => [id, providerSource.kind])),
  ).toEqual({
    "provider.agent-state.agents": "connected",
    "provider.bucket.agent-workspace": "connected",
    "provider.bucket.assets": "connected",
    "provider.bucket.receipts": "infrastructure",
    "provider.cache.requests": "connected",
    "provider.cache.timeline": "infrastructure",
    "provider.job.default": "connected",
    "provider.realtime.default": "connected",
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
}

/**
 * Verifies dependency edges and the protected route rate-limit projection.
 * @param graph - Complete accepted commerce graph.
 * @returns Completion when target/profile mappings preserve canonical order.
 */
export function assertCommerceEdges(graph: ApplicationGraph): void {
  expect(
    graph.edges
      .filter(({ kind }) => kind === "uses-provider-profile")
      .map(({ from, to }) => [from, to]),
  ).toEqual([
    ["announcements.feed", "provider.realtime.default"],
    ["assets.objects", "provider.bucket.assets"],
    ["job.orders.cleanup", "provider.job.default"],
    ["job.orders.export-orders", "provider.job.default"],
    ["orders.agent-workspace", "provider.bucket.agent-workspace"],
    ["orders.order-deep", "provider.agent-state.agents"],
    ["orders.order-review", "provider.agent-state.agents"],
    ["orders.order-support", "provider.agent-state.agents"],
    ["orders.prices", "provider.cache.requests"],
    ["orders.rate-limits", "provider.cache.timeline"],
    ["orders.updates", "provider.realtime.default"],
    ["receipts.objects", "provider.bucket.receipts"],
  ]);
  expect(graph.nodes.find((node) => node.id === "route.post.orders")).toMatchObject({
    config: {
      rateLimit: {
        key: { kind: "header", name: "x-customer-email" },
        limit: 20,
        storeId: "orders.rate-limits",
        windowMs: 60_000,
      },
    },
  });
}
