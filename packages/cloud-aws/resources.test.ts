import { expect, test } from "bun:test";
import * as pulumi from "@pulumi/pulumi";
import type { MockResourceArgs } from "@pulumi/pulumi/runtime/mocks";
import {
  ZsysApplicationService,
  ZsysBuckets,
  ZsysCaches,
  ZsysContainerRegistry,
  ZsysNetwork,
  ZsysObservability,
  createValkeyClient,
} from "./src/index.js";

interface SeenResource {
  readonly type: string;
  readonly name: string;
  readonly inputs: Record<string, any>;
}

test("AWS storage, Valkey, observability, and deployment mappings are wired", async () => {
  const resources: SeenResource[] = [];
  await pulumi.runtime.setMocks(
    {
      newResource: (args: MockResourceArgs) => {
        resources.push({ type: args.type, name: args.name, inputs: args.inputs });
        return {
          id: `${args.name}-id`,
          state: {
            ...args.inputs,
            id: `${args.name}-id`,
            arn: `arn:test:${args.name}`,
            name: args.inputs.name ?? args.name,
            bucket: args.inputs.bucket ?? `${args.name}.bucket`,
            endpoints: [{ address: "cache.test", port: 6379 }],
            publicSubnetIds: ["public-1"],
            privateSubnetIds: ["private-1"],
            repositoryUrl: `registry.test/${args.name}`,
            resourceId: args.inputs.resourceId ?? `service/${args.name}`,
          },
        };
      },
      call: () => ({ region: "us-east-1", name: "us-east-1" }),
    },
    "zsys-resources-test",
    "development",
  );

  let buckets: ZsysBuckets | undefined;
  let caches: ZsysCaches | undefined;
  let observability: ZsysObservability | undefined;
  let application: ZsysApplicationService | undefined;
  await pulumi.runtime.runInPulumiStack(() => {
    buckets = new ZsysBuckets("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      buckets: [{ id: "uploads" }],
    });
    caches = new ZsysCaches("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      caches: [{ id: "sessions", subnetIds: ["private-1"], securityGroupIds: ["sg-cache"] }],
    });
    new ZsysCaches("caches", {
      appId: "full-app",
      stackName: "zsys-nightly-1787058311503-edb6a526",
      graphHash: "sha256:orders",
      caches: [{ id: "prices" }],
    });
    observability = new ZsysObservability("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      retentionDays: 14,
      otlp: {
        endpoint: "https://otel.test",
        headersSecretArn: "arn:test:otel-headers",
        serviceName: "orders",
      },
    });
    const network = new ZsysNetwork("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
    });
    const registry = new ZsysContainerRegistry("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
    });
    application = new ZsysApplicationService("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      network,
      registry,
      environment: { APP_MODE: "test" },
      secrets: { API_TOKEN: "arn:test:api-token" },
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const typeSet = new Set(resources.map(({ type }) => type));
  expect([...typeSet]).toEqual(
    expect.arrayContaining([
      "aws:s3/bucket:Bucket",
      "aws:elasticache/serverlessCache:ServerlessCache",
      "aws:cloudwatch/logGroup:LogGroup",
    ]),
  );
  expect(resource(resources, "aws:s3/bucket:Bucket").inputs).toMatchObject({
    acl: "private",
    forceDestroy: false,
  });
  expect(
    resource(resources, "aws:elasticache/serverlessCache:ServerlessCache").inputs,
  ).toMatchObject({
    engine: "valkey",
    majorEngineVersion: "7",
  });
  expect(
    resources
      .filter(({ type }) => type === "aws:elasticache/serverlessCache:ServerlessCache")
      .every(({ inputs }) => inputs.name.length <= 40),
  ).toBe(true);
  const observabilityLogGroup = resources.find(
    ({ type, inputs }) =>
      type === "aws:cloudwatch/logGroup:LogGroup" &&
      inputs.name === "/zsys/development-orders-app-observability",
  );
  expect(observabilityLogGroup?.inputs).toMatchObject({
    retentionInDays: 14,
  });
  expect(await resolveOutput(caches!.caches[0].url)).toBe("rediss://cache.test:6379");
  expect(await resolveOutput(buckets!.buckets[0].environment.value)).toContain("uploads");
  expect(observability!.environment.map(({ name }) => name)).toEqual([
    "AWS_REGION",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_SERVICE_NAME",
  ]);
  expect(observability!.secrets.map(({ name }) => name)).toEqual(["OTEL_EXPORTER_OTLP_HEADERS"]);

  const definition = JSON.parse(
    await resolveOutput(application!.taskDefinition.containerDefinitions),
  )[0];
  expect(definition.environment).toEqual([
    { name: "APP_MODE", value: "test" },
    { name: "AWS_REGION", value: "us-east-1" },
  ]);
  expect(definition.secrets).toEqual([{ name: "API_TOKEN", valueFrom: "arn:test:api-token" }]);

  const client = createValkeyClient({ url: "rediss://cache.test:6379" });
  expect(client.connected).toBe(false);
  client.close();
});

test("AWS resource components reject an empty deployment region", async () => {
  await pulumi.runtime.setMocks(
    {
      newResource: (args: MockResourceArgs) => ({ id: args.name, state: args.inputs }),
      call: () => ({ region: "us-east-1", name: "us-east-1" }),
    },
    "zsys-region-test",
    "development",
  );
  await pulumi.runtime.runInPulumiStack(() => {
    expect(() => new ZsysBuckets("invalid", { region: "", buckets: [{ id: "files" }] })).toThrow(
      "AWS region must not be empty",
    );
    expect(() => new ZsysCaches("invalid", { region: "", caches: [{ id: "sessions" }] })).toThrow(
      "AWS region must not be empty",
    );
    expect(() => new ZsysObservability("invalid", { region: "" })).toThrow(
      "AWS region must not be empty",
    );
  });
});

function resource(resources: readonly SeenResource[], type: string): SeenResource {
  const value = resources.find((item) => item.type === type);
  if (value === undefined) throw new Error(`Missing mocked resource ${type}.`);
  return value;
}

function resolveOutput<T>(value: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => {
    value.apply((resolved) => {
      resolve(resolved);
      return resolved;
    });
  });
}
