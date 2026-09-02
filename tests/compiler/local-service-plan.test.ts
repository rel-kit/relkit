import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "../../packages/contracts/src/index.ts";
import { generateLocalServicePlan } from "../../packages/compiler/src/index.ts";
import type { ApplicationGraph, ProviderBindingNode } from "../../packages/graph/src/index.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

test("local-service plan preserves declarations and graph requirements without values", () => {
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    appId: "commerce",
    nodes: [
      provider("provider.cache.requests", "cache", "requests", "redis", "redis-docker"),
      provider("provider.bucket.assets", "bucket", "assets", "s3", "minio-docker"),
    ],
    edges: [
      { kind: "uses-provider-profile", from: "orders.timeline", to: "provider.cache.requests" },
      { kind: "uses-provider-profile", from: "orders.prices", to: "provider.cache.requests" },
    ],
  };

  expect(generateLocalServicePlan(graph, "sha256:graph")).toEqual({
    version: 1,
    graphHash: "sha256:graph",
    services: [
      {
        bindingId: "provider.bucket.assets",
        capability: "bucket",
        profile: "assets",
        materializerId: "docker",
        recipe: { integrationId: "s3", recipeId: "minio-docker", recipeVersion: 1 },
        configuration: {},
        requiredBy: [],
      },
      {
        bindingId: "provider.cache.requests",
        capability: "cache",
        profile: "requests",
        materializerId: "docker",
        recipe: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
        configuration: {},
        requiredBy: ["orders.prices", "orders.timeline"],
      },
    ],
  });
  expect(JSON.stringify(generateLocalServicePlan(graph, "sha256:graph"))).not.toContain(
    "not-local-plan",
  );
});

test("local-service plan bytes are independent of graph insertion order", () => {
  const nodes = [
    provider("provider.cache.timeline", "cache", "timeline", "redis", "redis-docker"),
    provider("provider.bucket.assets", "bucket", "assets", "s3", "minio-docker"),
  ];
  const edges = [
    { kind: "uses-provider-profile" as const, from: "orders.feed", to: nodes[0]!.id },
    { kind: "uses-provider-profile" as const, from: "orders.home", to: nodes[0]!.id },
  ];
  const graph = (reverse: boolean): ApplicationGraph => ({
    contractVersion: GRAPH_VERSION,
    appId: "commerce",
    nodes: reverse ? [...nodes].reverse() : nodes,
    edges: reverse ? [...edges].reverse() : edges,
  });

  expect(JSON.stringify(generateLocalServicePlan(graph(false), "sha256:graph"))).toBe(
    JSON.stringify(generateLocalServicePlan(graph(true), "sha256:graph")),
  );
});

function provider(
  id: string,
  capability: "bucket" | "cache",
  profile: string,
  integrationId: string,
  recipeId: string,
): ProviderBindingNode {
  return {
    kind: "provider",
    id,
    source,
    capability,
    profile,
    adapter: {
      integrationId,
      adapterId: integrationId,
      protocolVersion: 1,
      behavior: { shouldStayInRuntime: "not-local-plan" },
      connectionContract: {},
      connection: {},
      features: [],
    },
    providerSource: { kind: "connected" },
    namedValues: [],
    local: { integrationId, recipeId, recipeVersion: 1 },
    deploymentRoles: [],
  };
}
