import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as pulumi from "../../packages/deploy-pulumi/node_modules/@pulumi/pulumi/index.js";
import type {
  ZsysApplicationService,
  ZsysBuckets,
  ZsysCaches,
  ZsysContainerRegistry,
  ZsysEventBus,
  ZsysJobQueues,
  ZsysNetwork,
  ZsysObservability,
} from "../../packages/cloud-aws/src/index.ts";
import { diffDeploymentPlans, fromGraph } from "../../packages/deploy/src/index.ts";
import type { DeploymentPlan } from "../../packages/deploy/src/plan.ts";
import type { ApplicationGraph, GraphNode } from "../../packages/graph/src/index.ts";

interface SeenResource {
  readonly type: string;
  readonly name: string;
  readonly inputs: Record<string, any>;
}

const resources: SeenResource[] = [];
const temporaryRoots: string[] = [];

// Provider modules are intentionally imported only after this mock is installed.
await pulumi.runtime.setMocks(
  {
    newResource: (args) => {
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
          privateSubnetIds: ["private-1", "private-2"],
          publicSubnetIds: ["public-1", "public-2"],
          repositoryUrl: `registry.test/${args.name}`,
          resourceId: args.inputs.resourceId ?? `service/${args.name}`,
          url: `https://sqs.test/${args.name}`,
        },
      };
    },
    call: () => ({ name: "us-east-1", region: "us-east-1" }),
  },
  "zsys-deployment-mocks",
  "development",
);

const { renderPulumiProgram } = await import("../../packages/deploy-pulumi/src/program.ts");
const {
  ZsysApplicationService,
  ZsysBuckets,
  ZsysCaches,
  ZsysContainerRegistry,
  ZsysEventBus,
  ZsysJobQueues,
  ZsysNetwork,
  ZsysObservability,
} = await import("../../packages/cloud-aws/src/index.ts");

afterEach(async () => {
  resources.length = 0;
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("executes the generated plan with stable capability mappings and secret-safe inputs", async () => {
  const plan = readPlan("plan-full.json");
  const seen = await runGeneratedProgram(plan, "full");
  const types = new Set(
    seen.filter(({ type }) => type !== "pulumi:pulumi:Stack").map(({ type }) => type),
  );

  expect([...types]).toEqual(
    expect.arrayContaining([
      "zsys:cloud-aws:application",
      "zsys:cloud-aws:ZsysNetwork",
      "zsys:cloud-aws:ZsysContainerRegistry",
      "zsys:cloud-aws:ZsysJobQueues",
      "zsys:cloud-aws:ZsysEventBus",
      "zsys:cloud-aws:ZsysBuckets",
      "zsys:cloud-aws:ZsysCaches",
      "zsys:cloud-aws:ZsysApplicationService",
      "aws:sqs/queue:Queue",
      "aws:cloudwatch/eventRule:EventRule",
      "aws:s3/bucket:Bucket",
    ]),
  );

  expect(
    resourceMatching(
      seen,
      "aws:sqs/queue:Queue",
      ({ name }) => name.includes("receipts-send") && !name.includes("dlq"),
    ).inputs,
  ).toMatchObject({
    visibilityTimeoutSeconds: 60,
  });
  expect(
    resourceMatching(seen, "aws:cloudwatch/eventRule:EventRule", ({ name }) =>
      name.includes("orders-created"),
    ).inputs,
  ).toMatchObject({ eventPattern: expect.any(String) });
  expect(resource(seen, "aws:s3/bucket:Bucket").inputs).toMatchObject({ acl: "private" });

  const secretPlan = fromGraph(withSecretConfiguration(loadGraph("valid-full")), {
    image: {
      name: "registry.example/orders",
      tag: "2026-08-18",
      health: plan.application.image.health,
    },
  });
  expect(JSON.stringify(secretPlan)).toContain("OPENAI_API_KEY");
  const secretBytes = JSON.stringify(await runGeneratedProgram(secretPlan, "secret"));
  expect(secretBytes).not.toContain("OPENAI_API_KEY");
  expect(secretBytes).not.toContain("synthetic-secret");
  expect(secretBytes).not.toContain("pulumiValue");
});

test("maps AWS resources with parents, tags, security rules, and secret injection", async () => {
  let network: InstanceType<typeof ZsysNetwork> | undefined;
  let registry: InstanceType<typeof ZsysContainerRegistry> | undefined;
  let application: InstanceType<typeof ZsysApplicationService> | undefined;
  let jobs: InstanceType<typeof ZsysJobQueues> | undefined;
  let events: InstanceType<typeof ZsysEventBus> | undefined;
  let buckets: InstanceType<typeof ZsysBuckets> | undefined;
  let caches: InstanceType<typeof ZsysCaches> | undefined;
  let observability: InstanceType<typeof ZsysObservability> | undefined;

  await pulumi.runtime.runInPulumiStack(() => {
    network = new ZsysNetwork("orders", { appId: "orders.app", graphHash: "sha256:orders" });
    registry = new ZsysContainerRegistry("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
    });
    application = new ZsysApplicationService("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      network,
      registry,
      containerName: "web",
      environment: { APP_MODE: "test" },
      secrets: { API_TOKEN: "arn:test:api-token" },
    });
    jobs = new ZsysJobQueues("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      jobs: [
        {
          id: "receipts.send",
          retry: {
            maxAttempts: 3,
            initialDelayMs: 100,
            maxDelayMs: 10_000,
            multiplier: 2,
            jitter: "none",
          },
          timeoutMs: 30_000,
          concurrency: 4,
        },
      ],
      schedules: [
        {
          id: "receipts.nightly",
          jobId: "receipts.send",
          cron: "0 2 * * *",
          timezone: "UTC",
          input: { orderId: "123" },
          overlap: "skip",
        },
      ],
    });
    events = new ZsysEventBus("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      events: [{ id: "orders.created", version: 1 }],
      eventTriggers: [
        {
          id: "orders.listener",
          targetFunctionId: "orders.handle",
          expansion: ["orders.created@1"],
          retry: {
            maxAttempts: 3,
            initialDelayMs: 100,
            maxDelayMs: 10_000,
            multiplier: 2,
            jitter: "none",
          },
        },
      ],
    });
    buckets = new ZsysBuckets("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      buckets: [{ id: "assets" }],
    });
    caches = new ZsysCaches("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      caches: [{ id: "prices", subnetIds: ["private-1"], securityGroupIds: ["sg-cache"] }],
    });
    observability = new ZsysObservability("orders", {
      appId: "orders.app",
      graphHash: "sha256:orders",
      otlp: { endpoint: "https://otel.test", headersSecretArn: "arn:test:otel-headers" },
    });
  });
  await waitForResources(20);

  const tags = {
    app: "orders.app",
    stack: "development",
    graphHash: "sha256:orders",
    "managed-by": "zsys",
  };
  expect(await resolveValue(application!.tags)).toEqual(tags);
  expect(await resolveValue(buckets!.tags)).toEqual(tags);
  expect(await resolveValue(caches!.tags)).toEqual(tags);
  expect(await resolveValue(observability!.tags)).toEqual(tags);

  const target = resource(resources, "aws:lb/targetGroup:TargetGroup");
  expect(target.inputs.healthCheck).toMatchObject({
    path: "/_zsys/v1/health/ready",
    protocol: "HTTP",
  });
  const albSecurity = resourceMatching(
    resources,
    "aws:ec2/securityGroup:SecurityGroup",
    ({ name }) => name.endsWith("-alb-sg"),
  );
  expect(albSecurity.inputs.ingress).toEqual([
    expect.objectContaining({ fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }),
  ]);
  const serviceSecurity = resourceMatching(
    resources,
    "aws:ec2/securityGroup:SecurityGroup",
    ({ name }) => name.endsWith("-service-sg"),
  );
  expect(serviceSecurity.inputs.ingress).toEqual([
    expect.objectContaining({
      fromPort: 3000,
      toPort: 3000,
      securityGroups: ["development-orders-app-network-alb-sg-id"],
    }),
  ]);
  expect(resource(resources, "aws:ecs/service:Service").inputs.networkConfiguration).toMatchObject({
    assignPublicIp: false,
    subnets: ["private-1", "private-2"],
  });

  const definition = JSON.parse(
    await resolveValue(
      resource(resources, "aws:ecs/taskDefinition:TaskDefinition").inputs.containerDefinitions,
    ),
  )[0];
  expect(definition.environment).toEqual([
    { name: "APP_MODE", value: "test" },
    { name: "AWS_REGION", value: "us-east-1" },
  ]);
  expect(definition.secrets).toEqual([{ name: "API_TOKEN", valueFrom: "arn:test:api-token" }]);
  expect(JSON.stringify(definition)).not.toContain("synthetic-secret");

  const queue = resourceMatching(
    resources,
    "aws:sqs/queue:Queue",
    ({ inputs }) => inputs.redrivePolicy !== undefined,
  );
  expect(queue.inputs).toMatchObject({ receiveWaitTimeSeconds: 20, visibilityTimeoutSeconds: 60 });
  expect(JSON.parse(await resolveValue(queue.inputs.redrivePolicy))).toMatchObject({
    maxReceiveCount: 3,
  });
  expect(resource(resources, "aws:scheduler/schedule:Schedule").inputs).toMatchObject({
    scheduleExpression: "cron(0 2 * * ? *)",
    flexibleTimeWindow: { mode: "OFF" },
  });

  const eventRule = resource(resources, "aws:cloudwatch/eventRule:EventRule");
  expect(JSON.parse(eventRule.inputs.eventPattern as string).detail).toMatchObject({
    eventId: ["orders.created"],
    version: [1],
  });
  expect(
    resource(resources, "aws:cloudwatch/eventTarget:EventTarget").inputs.inputTransformer,
  ).toEqual({
    inputPaths: { envelope: "$.detail" },
    inputTemplate: '{"schemaVersion":1,"envelope":<envelope>}',
  });
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

  expect(await resolveValue(application!.service.urn)).toContain(
    "zsys:cloud-aws:ZsysApplicationService$aws:ecs/service:Service",
  );
  expect(await resolveValue(jobs!.queues[0]!.queue.urn)).toContain(
    "zsys:cloud-aws:ZsysJobQueues$aws:sqs/queue:Queue",
  );
  expect(await resolveValue(events!.triggers[0]!.rules[0]!.urn)).toContain(
    "zsys:cloud-aws:ZsysEventBus$aws:cloudwatch/eventRule:EventRule",
  );
  expect(await resolveValue(buckets!.buckets[0]!.bucket.urn)).toContain(
    "zsys:cloud-aws:ZsysBuckets$aws:s3/bucket:Bucket",
  );
  expect(await resolveValue(caches!.caches[0]!.cache.urn)).toContain(
    "zsys:cloud-aws:ZsysCaches$aws:elasticache/serverlessCache:ServerlessCache",
  );
  expect(network!.serviceSecurityGroup).toBeDefined();
});

test("source moves preserve mocked Pulumi resource identities without replacement", async () => {
  const before = fromGraph(loadGraph("valid-full"), deploymentOptions());
  const after = fromGraph(moveSources(loadGraph("valid-full")), deploymentOptions());
  const beforeResources = await runGeneratedProgram(before, "before-move");
  const afterResources = await runGeneratedProgram(after, "after-move");

  expect(resourceKeys(beforeResources)).toEqual(resourceKeys(afterResources));
  expect(
    await resolveValue(
      resource(beforeResources, "aws:ecs/taskDefinition:TaskDefinition").inputs
        .containerDefinitions,
    ),
  ).toBe(
    await resolveValue(
      resource(afterResources, "aws:ecs/taskDefinition:TaskDefinition").inputs.containerDefinitions,
    ),
  );
  expect(diffDeploymentPlans(before, after).summary.replace).toBe(0);
  expect(JSON.stringify(afterResources)).not.toContain("src/moved/");
});

async function runGeneratedProgram(
  plan: DeploymentPlan,
  name: string,
): Promise<readonly SeenResource[]> {
  const root = await mkdtemp(join("packages/deploy-pulumi", ".pulumi-mock-"));
  temporaryRoots.push(root);
  const programPath = join(root, "index.ts");
  await writeFile(
    programPath,
    renderPulumiProgram(plan, { projectRoot: root, stackName: "CI/blue" }).indexTs,
  );
  const start = resources.length;
  await pulumi.runtime.runInPulumiStack(async () => {
    await import(`${pathToFileURL(programPath).href}?${name}`);
  });
  await waitForResources(start + programResourceCount(plan));
  return resources.slice(start);
}

function readPlan(name: string): DeploymentPlan {
  return JSON.parse(readFileSync(join(import.meta.dir, "golden", name), "utf8")) as DeploymentPlan;
}

function loadGraph(name: string): ApplicationGraph {
  return JSON.parse(
    readFileSync(
      join(import.meta.dir, "..", "compiler", "fixtures", name, "expected.graph.json"),
      "utf8",
    ),
  ) as ApplicationGraph;
}

function deploymentOptions() {
  return {
    image: {
      name: "registry.example/orders",
      tag: "2026-08-18",
      digest: "sha256:orders-image",
      health: {
        livenessPath: "/_zsys/v1/health/live",
        readinessPath: "/_zsys/v1/health/ready",
        port: 8080,
        intervalMs: 10_000,
        timeoutMs: 2_000,
      },
    },
  } as const;
}

function withSecretConfiguration(graph: ApplicationGraph): ApplicationGraph {
  const secret: GraphNode = {
    kind: "env",
    id: "OPENAI_API_KEY",
    name: "OPENAI_API_KEY",
    type: "secret",
    requiredIn: [],
    hasDefault: false,
    sensitive: true,
    source: { file: "src/env.ts", line: 1, column: 1 },
  };
  return {
    ...graph,
    nodes: graph.nodes
      .map((node) =>
        node.kind === "provider"
          ? {
              ...node,
              environment: [
                ...node.environment,
                { name: "OPENAI_API_KEY", type: "secret", sensitive: true },
              ],
              configuration: {
                ...node.configuration,
                apiKey: {
                  kind: "env-ref",
                  name: "OPENAI_API_KEY",
                  type: "secret",
                  sensitive: true,
                },
              },
            }
          : node,
      )
      .concat(secret),
  };
}

function moveSources(graph: ApplicationGraph): ApplicationGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      source: { ...node.source, file: `src/moved/${node.source.file.replace(/^src\//, "")}` },
    })),
  };
}

function resource(resourcesToSearch: readonly SeenResource[], type: string): SeenResource {
  const found = resourcesToSearch.find((item) => item.type === type);
  if (found === undefined) throw new Error(`Missing mocked resource ${type}.`);
  return found;
}

function resourceMatching(
  resourcesToSearch: readonly SeenResource[],
  type: string,
  predicate: (resource: SeenResource) => boolean,
): SeenResource {
  const found = resourcesToSearch.find((item) => item.type === type && predicate(item));
  if (found === undefined) throw new Error(`Missing mocked resource ${type}.`);
  return found;
}

function resourceKeys(resourcesToCompare: readonly SeenResource[]): readonly string[] {
  return resourcesToCompare.map(({ type, name }) => `${type}:${name}`).sort();
}

function programResourceCount(plan: DeploymentPlan): number {
  return (
    1 +
    1 +
    1 +
    1 +
    plan.jobs.length +
    plan.schedules.length +
    plan.events.length +
    plan.eventTriggers.length +
    plan.buckets.length +
    plan.caches.length +
    (plan.observability === undefined ? 0 : 1)
  );
}

async function resolveValue<T>(
  value: T | { apply(callback: (value: T) => T): unknown },
): Promise<T> {
  if (value !== null && typeof value === "object" && "apply" in value)
    return new Promise((resolve) =>
      (value as { apply(callback: (value: T) => T): unknown }).apply(resolve),
    );
  return value as T;
}

async function waitForResources(target: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (resources.length < target) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${target} mocked resources.`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
