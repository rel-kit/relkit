import { expect, test } from "bun:test";
import {
  DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  type DeploymentPlan,
  type InfrastructureOperationPlan,
} from "@relkit/deploy";
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineLocalRecipeReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
} from "@relkit/provider";
import { aws } from "./src/aws.ts";
import { awsAccess } from "./src/access/index.ts";
import { awsHost } from "./src/host/index.ts";
import { awsInfrastructure } from "./src/infrastructure/index.ts";

test("exports executable deployment roles through separate protocol subpaths", () => {
  for (const [role, integration] of [
    ["host", awsHost],
    ["infrastructure", awsInfrastructure],
    ["access", awsAccess],
  ] as const) {
    expect(integration).toMatchObject({
      kind: "deployment-integration",
      protocolVersion: DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
      integrationId: "aws",
      role,
    });
    expect(integration.materialize).toBeFunction();
    expect(Object.isFrozen(integration)).toBe(true);
  }
});

test("materializes host-only ECS and CloudWatch operations without binding lifecycle", () => {
  const result = awsHost.materialize({ plan: plan(), stackName: "test" });
  const types = result.resources.map((entry) => entry.type);
  expect(types).toContain("aws:ecs/service:Service");
  expect(types).toContain("aws:cloudwatch/logGroup:LogGroup");
  expect(types).not.toContain("aws:s3/bucket:Bucket");
  expect(types).not.toContain("aws:elasticache/replicationGroup:ReplicationGroup");
  expect(result.outputs).toHaveProperty("endpoint");
  const definition = result.resources.find((entry) => entry.id.endsWith(".task-definition"));
  expect(definition?.inputs.containerDefinitions).toMatchObject({
    value: [{ image: "registry.example/test-app:v1" }],
  });
});

test("dispatches supported S3 and Redis operations with authoritative outputs", () => {
  const base = plan();
  const host = awsHost.materialize({ plan: base, stackName: "test" });
  const bucket = infrastructure("bucket", "s3", ["signedReadUrl"], {
    versioning: true,
  });
  const cache = infrastructure("cache", "redis", ["atomicIncrement"], {
    engine: "valkey",
  });
  const s3 = awsInfrastructure.materialize({
    plan: { ...base, infrastructureOperations: [bucket] },
    stackName: "test",
    operation: bucket,
    host,
  });
  const redis = awsInfrastructure.materialize({
    plan: { ...base, infrastructureOperations: [cache] },
    stackName: "test",
    operation: cache,
    host,
  });
  expect(s3.resources.map((entry) => entry.type)).toEqual(["aws:s3/bucket:Bucket"]);
  expect(Object.keys(s3.connection).sort()).toEqual(["bucketName", "endpoint", "region"]);
  expect(redis.resources.map((entry) => entry.type)).toContain(
    "aws:elasticache/replicationGroup:ReplicationGroup",
  );
  expect(redis.connection).toHaveProperty("url");
});

test("aws authoring accepts only supported adapters and safe options", () => {
  const integration = defineIntegrationReference("s3");
  const bucket = defineProviderCapability("bucket");
  const adapter = defineProviderAdapter({
    integration,
    capability: bucket,
    adapterId: "s3",
    connectionContract: defineConnectionContract({ bucketName: { authoredValue: "fallback" } }),
    connection: {},
    behavior: defineProviderBehavior({}),
    localRecipe: defineLocalRecipeReference(integration, "s3-local", 1),
  });
  expect(aws(adapter, { versioning: true })).toMatchObject({
    kind: "provider-infrastructure-source",
    options: { versioning: true },
    access: { value: { kind: "iam" } },
  });
  expect(() => aws(adapter, { unknown: true } as never)).toThrow("Unknown AWS option");
});

function plan(): DeploymentPlan {
  return {
    contractVersion: 3,
    graphHash: "sha256:test",
    application: {
      id: "test-app",
      image: {
        name: "registry.example/test-app:v1",
        health: { livenessPath: "/live", readinessPath: "/ready", port: 3000 },
      },
      environmentNames: [],
    },
    engine: reference("engine", "pulumi"),
    host: reference("host", "aws"),
    connectedBindings: [],
    infrastructureOperations: [],
    accessOperations: [],
    http: {
      logicalName: "test-app-http",
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

function infrastructure(
  capability: "bucket" | "cache",
  adapterId: "s3" | "redis",
  features: readonly string[],
  configuration: Record<string, string | boolean>,
): InfrastructureOperationPlan {
  const field = capability === "bucket" ? "bucketName" : "url";
  return {
    kind: "infrastructure-operation",
    id: `provider.${capability}.default`,
    bindingId: `provider.${capability}.default`,
    capability,
    profile: "default",
    adapter: {
      integrationId: adapterId,
      adapterId,
      protocolVersion: 1,
      behavior: {},
      connectionContract: {
        [field]: { required: true, sensitive: capability === "cache", authoredValue: "fallback" },
      },
      connection: {},
      features,
    },
    namedValues: [],
    integration: reference("infrastructure", "aws", configuration),
  };
}

function reference<Role extends "engine" | "host" | "infrastructure" | "access">(
  role: Role,
  integrationId: string,
  configuration: Record<string, string | boolean> = {},
) {
  return { role, integrationId, protocolVersion: 1 as const, configuration };
}
