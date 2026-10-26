/** Retains original generation assertions for runtime-integration-plan, registered by the owning suite. */
import { expect } from "bun:test";
import { GRAPH_VERSION, type RuntimeIntegrationPlan } from "../../packages/contracts/src/index.ts";
import {
  generateRuntimeIntegrationImports,
  generateRuntimeIntegrationPlan,
} from "../../packages/compiler/src/index.ts";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";
import {
  source,
  provider,
  registration,
  runtimePackage,
  planEntry,
  expectPlanError,
} from "./runtime-integration-plan.fixture.js";
export function case3Generation() {
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    appId: "commerce",
    nodes: [provider("provider.cache.primary", "cache", "primary", "redis", "redis")],
    edges: [{ kind: "uses-provider-profile", from: "requests", to: "provider.cache.primary" }],
  };
  expectPlanError(
    () =>
      generateRuntimeIntegrationPlan(graph, "sha256:graph", [
        runtimePackage("redis", [registration("cache", "other")]),
      ]),
    "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
  );
  expectPlanError(
    () =>
      generateRuntimeIntegrationPlan(graph, "sha256:graph", [
        runtimePackage("redis"),
        { ...runtimePackage("redis"), packageName: "@other/redis" },
      ]),
    "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
  );

  const duplicateGraph: ApplicationGraph = {
    ...graph,
    nodes: [
      ...graph.nodes,
      provider("provider.cache.secondary", "cache", "secondary", "redis-copy", "redis"),
    ],
    edges: [
      ...graph.edges,
      { kind: "uses-provider-profile", from: "timeline", to: "provider.cache.secondary" },
    ],
  };
  expectPlanError(
    () =>
      generateRuntimeIntegrationPlan(duplicateGraph, "sha256:graph", [
        runtimePackage("redis"),
        runtimePackage("redis-copy", [registration("cache", "redis")]),
      ]),
    "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE",
  );
}

export function case4Generation() {
  const plan: RuntimeIntegrationPlan = {
    version: 1,
    graphHash: "sha256:graph",
    integrations: [
      planEntry("cloudflare", "cache", "cloudflare-kv"),
      planEntry("redis", "cache", "redis"),
      planEntry("cloudflare", "bucket", "cloudflare-r2"),
    ],
  };
  const source = generateRuntimeIntegrationImports(plan);
  expect(
    generateRuntimeIntegrationImports({
      ...plan,
      integrations: [...plan.integrations].reverse(),
    }),
  ).toBe(source);
  expect(source.match(/await import\(/g)).toHaveLength(2);
  expect(source).toContain('await import("@relkit/cloudflare/runtime")');
  expect(source).toContain('await import("@relkit/redis/runtime")');
  expect(source.indexOf("await Effect.runPromise")).toBeLessThan(source.indexOf("await import("));
}
