import { expect, test } from "bun:test";
import { GRAPH_VERSION, type SourceLocation } from "@relkit/contracts";
import type { ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import { diffDeploymentPlans } from "./src/diff.ts";
import { fromGraph } from "./src/from-graph.ts";
import { assertDeploymentPlanVersion, DEPLOYMENT_PLAN_VERSION } from "./src/plan.ts";

const source: SourceLocation = { file: "src/app.ts", line: 1, column: 1 };
const bucketProvider = provider("bucket", "default", "s3", "connected", "BUCKET_NAME");
const cacheProvider = provider("cache", "default", "redis", "infrastructure", "CACHE_URL");
const graph: ApplicationGraph = {
  contractVersion: GRAPH_VERSION,
  appId: "ownership-app",
  nodes: [
    {
      kind: "app",
      id: "ownership-app",
      source,
      deploymentRoles: [
        { role: "engine", integrationId: "pulumi", protocolVersion: 1, configuration: {} },
        { role: "host", integrationId: "aws", protocolVersion: 1, configuration: {} },
      ],
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
    {
      kind: "function",
      invocationMode: "callable",
      id: "handler",
      source,
      input: null,
      output: null,
    },
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

test("plans only infrastructure bindings and omits connected IAM", () => {
  const plan = fromGraph(graph);

  expect(() => assertDeploymentPlanVersion(plan)).not.toThrow();
  expect(plan.contractVersion).toBe(DEPLOYMENT_PLAN_VERSION);
  expect(plan.engine.integrationId).toBe("pulumi");
  expect(plan.host.integrationId).toBe("aws");
  expect(plan.connectedBindings.map(({ bindingId }) => bindingId)).toEqual([bucketProvider.id]);
  expect(plan.infrastructureOperations.map(({ bindingId }) => bindingId)).toEqual([
    cacheProvider.id,
  ]);
  expect(plan.accessOperations.map(({ bindingId }) => bindingId)).toEqual([cacheProvider.id]);
  expect(plan.buckets).toEqual([]);
  expect(plan.caches.map(({ id, bindingId }) => ({ id, bindingId }))).toEqual([
    { id: "prices", bindingId: cacheProvider.id },
  ]);
  expect(plan.iam.serviceRole.statements.map(({ capability }) => capability)).toEqual(["cache"]);
  expect(JSON.stringify(plan)).not.toContain("redis://");
  expect(JSON.stringify(plan)).not.toContain("providerBindings");
  expect(plan.infrastructureOperations[0]).not.toHaveProperty("ownership");
});

test("rejects a previous deployment plan without adapting it", () => {
  expect(() => assertDeploymentPlanVersion({ contractVersion: 2 })).toThrow(
    expect.objectContaining({
      code: "RELKIT_DEPLOYMENT_PLAN_VERSION_UNSUPPORTED",
      message: expect.stringContaining("Regenerate with `relkit deploy preview`"),
    }),
  );
});

test("rejects spoofed role ownership and orphan access operations", () => {
  const plan = fromGraph(graph);
  const lifecycleOnConnected = {
    ...plan,
    connectedBindings: [{ ...plan.connectedBindings[0]!, integration: plan.engine }],
  };
  const accessOnConnected = {
    ...plan,
    accessOperations: [
      { ...plan.accessOperations[0]!, bindingId: plan.connectedBindings[0]!.bindingId },
    ],
  };

  for (const invalid of [lifecycleOnConnected, accessOnConnected])
    expect(() => assertDeploymentPlanVersion(invalid)).toThrow(
      expect.objectContaining({ code: "RELKIT_DEPLOYMENT_PLAN_INVALID" }),
    );
});

test("diffs integration roles and runtime wiring without deleting connected resources", () => {
  const before = fromGraph(graph);
  const after = {
    ...before,
    host: { ...before.host, integrationId: "other-host" },
    connectedBindings: [],
  };
  const diff = diffDeploymentPlans(before, after);

  expect(diff.changes.map(({ stableId, operation }) => [stableId, operation])).toEqual([
    ["application-host:host", "replace"],
    [`connected-binding:${bucketProvider.id}`, "delete"],
  ]);
  expect(diff.summary).toMatchObject({ delete: 1, replace: 1, destructive: 1 });
  expect(diff.changes.find(({ kind }) => kind === "connected-binding")).toMatchObject({
    risk: "low",
    confirmation: "none",
    confirmationReasons: [],
  });
});

function provider(
  capability: ProviderBindingNode["capability"],
  profile: string,
  adapter: string,
  sourceKind: "connected" | "infrastructure",
  environmentName: string,
): ProviderBindingNode {
  const infrastructure = sourceKind === "infrastructure";
  return {
    kind: "provider",
    id: `provider.${capability}.${profile}`,
    source,
    capability,
    profile,
    adapter: {
      integrationId: adapter,
      adapterId: adapter,
      protocolVersion: 1,
      behavior: {},
      connectionContract: {
        connection: {
          required: true,
          sensitive: environmentName.includes("URL"),
          authoredValue: "fixed",
        },
      },
      connection: {},
      features: [],
    },
    providerSource: infrastructure
      ? { kind: "infrastructure", integrationId: "aws", options: {} }
      : { kind: "connected" },
    namedValues: [
      {
        field: "connection",
        name: environmentName,
        type: environmentName.includes("URL") ? "secret-string" : "string",
        sensitive: environmentName.includes("URL"),
      },
    ],
    ...(infrastructure ? { access: { actions: ["elasticache:Connect"] } } : {}),
    deploymentRoles: infrastructure
      ? [
          {
            role: "infrastructure",
            integrationId: "aws",
            protocolVersion: 1,
            configuration: {},
          },
          {
            role: "access",
            integrationId: "aws",
            protocolVersion: 1,
            configuration: { actions: ["elasticache:Connect"] },
          },
        ]
      : [],
  };
}
