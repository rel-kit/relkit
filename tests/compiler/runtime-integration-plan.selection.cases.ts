/** Retains original selection assertions for runtime-integration-plan, registered by the owning suite. */
import { expect } from "bun:test";
import { GRAPH_VERSION } from "../../packages/contracts/src/index.ts";
import { generateRuntimeIntegrationPlan } from "../../packages/compiler/src/index.ts";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";
import { provider, runtimePackage } from "./runtime-integration-plan.fixture.js";
export function case1Selection() {
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    appId: "commerce",
    nodes: [
      provider("provider.cache.unused", "cache", "unused", "cloudflare", "cloudflare-kv"),
      provider("provider.cache.timeline", "cache", "timeline", "redis", "redis"),
      provider("provider.bucket.assets", "bucket", "assets", "s3", "s3"),
      provider("provider.cache.requests", "cache", "requests", "redis", "redis"),
    ],
    edges: [
      { kind: "uses-provider-profile", from: "timeline", to: "provider.cache.timeline" },
      { kind: "uses-provider-profile", from: "assets", to: "provider.bucket.assets" },
      { kind: "uses-provider-profile", from: "requests", to: "provider.cache.requests" },
    ],
  };
  const plan = generateRuntimeIntegrationPlan(graph, "sha256:graph", [
    runtimePackage("redis"),
    runtimePackage("s3"),
    runtimePackage("cloudflare"),
  ]);

  expect(plan).toEqual({
    version: 1,
    graphHash: "sha256:graph",
    integrations: [
      {
        integrationId: "s3",
        capability: "bucket",
        adapterId: "s3",
        protocolVersion: 1,
        packageName: "@relkit/s3",
        packageVersion: "0.1.0",
        exportName: "./runtime",
      },
      {
        integrationId: "redis",
        capability: "cache",
        adapterId: "redis",
        protocolVersion: 1,
        packageName: "@relkit/redis",
        packageVersion: "0.1.0",
        exportName: "./runtime",
      },
    ],
  });
}
