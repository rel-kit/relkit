import { expect, test } from "bun:test";
import { GRAPH_VERSION, type SourceLocation } from "@relkit/contracts";
import type { ApplicationGraph, ProviderProfileNode } from "@relkit/graph";
import { fromGraph } from "./src/from-graph.ts";
import { DEPLOYMENT_PLAN_VERSION } from "./src/plan.ts";

const source: SourceLocation = { file: "src/app.ts", line: 1, column: 1 };

test("plans only managed bindings and omits external IAM", () => {
  const bucketProvider = provider("buckets", "default", "s3", "external", "BUCKET_NAME");
  const cacheProvider = provider("cache", "default", "redis", "managed", "CACHE_URL");
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    appId: "ownership-app",
    nodes: [
      {
        kind: "app",
        id: "ownership-app",
        source,
        providerBindings: [bucketProvider.id, cacheProvider.id],
      },
      bucketProvider,
      cacheProvider,
      {
        kind: "env",
        id: "BUCKET_NAME",
        source,
        name: "BUCKET_NAME",
        type: "string",
        requiredIn: [],
        hasDefault: false,
        sensitive: false,
      },
      {
        kind: "env",
        id: "CACHE_URL",
        source,
        name: "CACHE_URL",
        type: "secret-string",
        requiredIn: [],
        hasDefault: false,
        sensitive: true,
      },
      { kind: "function", id: "handler", source, input: null, output: null },
      { kind: "bucket", id: "assets", source, profile: "default", visibility: "private" },
      { kind: "cache", id: "prices", source, profile: "default", key: null, value: null },
    ],
    edges: [
      { kind: "uses-provider-profile", from: "assets", to: bucketProvider.id },
      { kind: "uses-provider-profile", from: "prices", to: cacheProvider.id },
      { kind: "uses-bucket", from: "handler", to: "assets" },
      { kind: "uses-cache", from: "handler", to: "prices" },
    ],
  };

  const plan = fromGraph(graph);

  expect(plan.contractVersion).toBe(DEPLOYMENT_PLAN_VERSION);
  expect(plan.providerBindings.map(({ id }) => id)).toEqual([cacheProvider.id]);
  expect(plan.buckets).toEqual([]);
  expect(plan.caches.map(({ id, bindingId }) => ({ id, bindingId }))).toEqual([
    { id: "prices", bindingId: cacheProvider.id },
  ]);
  expect(plan.iam.serviceRole.statements.map(({ capability }) => capability)).toEqual(["cache"]);
  expect(JSON.stringify(plan)).not.toContain("redis://");
});

function provider(
  capability: string,
  profile: string,
  adapter: string,
  ownership: "external" | "managed",
  environmentName: string,
): ProviderProfileNode {
  return {
    kind: "provider",
    id: `provider.${capability}.${profile}`,
    source,
    capability,
    profile,
    adapter,
    ownership,
    configuration: {
      connection: {
        kind: "env-ref",
        name: environmentName,
        type: environmentName.includes("URL") ? "secret-string" : "string",
        sensitive: environmentName.includes("URL"),
      },
    },
    environment: [
      {
        name: environmentName,
        type: environmentName.includes("URL") ? "secret-string" : "string",
        sensitive: environmentName.includes("URL"),
      },
    ],
  };
}
