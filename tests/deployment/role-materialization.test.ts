import { expect, test } from "bun:test";
import * as pulumi from "../../packages/deploy-pulumi/node_modules/@pulumi/pulumi/index.js";
import type { MockResourceArgs } from "../../packages/deploy-pulumi/node_modules/@pulumi/pulumi/runtime/mocks.js";
import type {
  ConnectedBindingPlan,
  DeploymentPlan,
  InfrastructureOperationPlan,
} from "../../packages/deploy/src/index.ts";
import { diffDeploymentPlans } from "../../packages/deploy/src/diff.ts";
import { materializeDeploymentOperations } from "../../packages/deploy-pulumi/src/materialization.ts";
import { materializePulumiDeployment } from "../../packages/deploy-pulumi/src/program.ts";
import { awsAccess } from "../../integrations/packages/aws/src/access/index.ts";
import { awsHost } from "../../integrations/packages/aws/src/host/index.ts";
import { awsInfrastructure } from "../../integrations/packages/aws/src/infrastructure/index.ts";
import { pulumiEngine } from "../../integrations/packages/pulumi/src/engine/index.ts";

test("loads role materializers while connected wiring owns no lifecycle", () => {
  const before = plan();
  const program = materializeDeploymentOperations(before, {
    stackName: "test",
    integrations: [pulumiEngine, awsHost, awsInfrastructure, awsAccess],
  });
  const resourceTypes = program.resources.map((entry) => entry.type);
  expect(resourceTypes).toContain("aws:elasticache/replicationGroup:ReplicationGroup");
  expect(resourceTypes).toContain("aws:ec2/securityGroupRule:SecurityGroupRule");
  expect(resourceTypes).not.toContain("aws:s3/bucket:Bucket");
  expect(program.bindings["provider.bucket.external"]).toMatchObject({
    endpoint: "https://r2.example.test",
    bucketName: "assets",
    region: "auto",
  });
  expect(program.bindings["provider.cache.default"]).toHaveProperty("url");

  const after = { ...before, connectedBindings: [] };
  const next = materializeDeploymentOperations(after, {
    stackName: "test",
    integrations: [pulumiEngine, awsHost, awsInfrastructure, awsAccess],
  });
  expect(next.resources.map((entry) => entry.id)).toEqual(
    program.resources.map((entry) => entry.id),
  );
  expect(diffDeploymentPlans(before, after).changes).toEqual([
    expect.objectContaining({
      kind: "connected-binding",
      operation: "delete",
      risk: "low",
      confirmation: "none",
    }),
  ]);
});

test("rejects unsupported infrastructure before creating any engine resource", () => {
  const invalid = plan();
  const operation = {
    ...invalid.infrastructureOperations[0]!,
    adapter: { ...invalid.infrastructureOperations[0]!.adapter, adapterId: "other" },
  };
  expect(() =>
    materializeDeploymentOperations(
      { ...invalid, infrastructureOperations: [operation] },
      {
        stackName: "test",
        integrations: [pulumiEngine, awsHost, awsInfrastructure, awsAccess],
      },
    ),
  ).toThrow("AWS does not support");
});

test("executes AWS role operations through Pulumi without an AWS code branch", async () => {
  const resources: Array<{ readonly type: string; readonly name: string }> = [];
  await pulumi.runtime.setMocks(
    {
      newResource: (args: MockResourceArgs) => {
        resources.push({ type: args.type, name: args.name });
        return {
          id: `${args.name}-id`,
          state: {
            ...args.inputs,
            id: `${args.name}-id`,
            arn: `arn:test:${args.name}`,
            name: args.name,
            dnsName: `${args.name}.example.test`,
            repositoryUrl: `registry.example.test/${args.name}`,
            bucket: args.name,
            region: "us-east-1",
            primaryEndpointAddress: `${args.name}.cache.test`,
            port: 6379,
          },
        };
      },
      call: (args) => args.inputs,
    },
    "relkit-role-materialization",
    "test",
  );
  let resourceCount = 0;
  await pulumi.runtime.runInPulumiStack(async () => {
    resourceCount = materializePulumiDeployment(plan(), {
      stackName: "test",
      integrations: [pulumiEngine, awsHost, awsInfrastructure, awsAccess],
    }).resourceCount;
  });
  await Bun.sleep(100);
  expect(resources.some((entry) => entry.type === "aws:ecs/service:Service")).toBe(true);
  expect(
    resources.some((entry) => entry.type === "aws:elasticache/replicationGroup:ReplicationGroup"),
  ).toBe(true);
  expect(resources.some((entry) => entry.type === "aws:s3/bucket:Bucket")).toBe(false);
  expect(resourceCount).toBe(
    resources.filter((entry) => entry.type !== "pulumi:pulumi:Stack").length,
  );
});

function plan(): DeploymentPlan {
  const connected = connectedBinding();
  const infrastructure = infrastructureBinding();
  return {
    contractVersion: 3,
    graphHash: "sha256:deployment-roles",
    application: {
      id: "role-app",
      image: {
        name: "role-app",
        tag: "latest",
        health: { livenessPath: "/live", readinessPath: "/ready", port: 3000 },
      },
      environmentNames: [],
    },
    engine: reference("engine", "pulumi"),
    host: reference("host", "aws"),
    connectedBindings: [connected],
    infrastructureOperations: [infrastructure],
    accessOperations: [
      {
        kind: "access-operation",
        id: `${infrastructure.bindingId}.access`,
        bindingId: infrastructure.bindingId,
        integration: reference("access", "aws", { kind: "network", port: 6379 }),
      },
    ],
    http: {
      logicalName: "role-app-http",
      port: 3000,
      health: { livenessPath: "/live", readinessPath: "/ready", port: 3000 },
      routes: [],
      configurationNames: [],
    },
    jobs: [],
    schedules: [],
    events: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    iam: { serviceRole: { statements: [] }, perFunction: [] },
  };
}

function connectedBinding(): ConnectedBindingPlan {
  return {
    kind: "connected-binding",
    bindingId: "provider.bucket.external",
    capability: "bucket",
    profile: "external",
    adapter: {
      integrationId: "s3",
      adapterId: "s3",
      protocolVersion: 1,
      behavior: { forcePathStyle: true },
      connectionContract: {
        endpoint: { required: true, sensitive: false, authoredValue: "fixed" },
        bucketName: { required: true, sensitive: false, authoredValue: "fixed" },
        region: { required: true, sensitive: false, authoredValue: "fixed" },
      },
      connection: {
        endpoint: "https://r2.example.test",
        bucketName: "assets",
        region: "auto",
      },
      features: ["signedReadUrl", "signedWriteUrl"],
    },
    namedValues: [],
  };
}

function infrastructureBinding(): InfrastructureOperationPlan {
  return {
    kind: "infrastructure-operation",
    id: "provider.cache.default",
    bindingId: "provider.cache.default",
    capability: "cache",
    profile: "default",
    adapter: {
      integrationId: "redis",
      adapterId: "redis",
      protocolVersion: 1,
      behavior: {},
      connectionContract: {
        url: { required: true, sensitive: true, authoredValue: "fallback" },
      },
      connection: {},
      features: ["atomicIncrement"],
    },
    namedValues: [],
    integration: reference("infrastructure", "aws", { engine: "valkey" }),
  };
}

function reference<Role extends "engine" | "host" | "infrastructure" | "access">(
  role: Role,
  integrationId: string,
  configuration: Record<string, string | number> = {},
) {
  return { role, integrationId, protocolVersion: 1 as const, configuration };
}
