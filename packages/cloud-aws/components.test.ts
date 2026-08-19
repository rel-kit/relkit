import { describe, expect, test } from "bun:test";
import * as pulumi from "@pulumi/pulumi";
import type { MockResourceArgs } from "@pulumi/pulumi/runtime/mocks";
import { ZsysApplicationService, ZsysContainerRegistry, ZsysNetwork } from "./src/index.js";
import { iamRoleName } from "./src/components/common.js";

interface SeenResource {
  readonly type: string;
  readonly name: string;
  readonly inputs: Record<string, any>;
}

test("AWS components map the HTTP service with stable identity and safe defaults", async () => {
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
            vpcId: args.inputs.vpcId ?? `${args.name}-vpc`,
            publicSubnetIds: ["public-1", "public-2"],
            privateSubnetIds: ["private-1", "private-2"],
            repositoryUrl: `registry.test/${args.name}`,
            resourceId: args.inputs.resourceId ?? `service/${args.name}`,
          },
        };
      },
      call: () => ({ region: "us-east-1", name: "us-east-1" }),
    },
    "zsys-test",
    "development",
  );

  let application: ZsysApplicationService | undefined;
  await pulumi.runtime.runInPulumiStack(() => {
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
      containerName: "web",
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const typeSet = new Set(resources.map(({ type }) => type));
  expect([...typeSet]).toEqual(
    expect.arrayContaining([
      "zsys:cloud-aws:ZsysNetwork",
      "awsx:ec2:Vpc",
      "aws:ecr/repository:Repository",
      "aws:ecs/cluster:Cluster",
      "aws:ecs/taskDefinition:TaskDefinition",
      "aws:ecs/service:Service",
      "aws:lb/loadBalancer:LoadBalancer",
      "aws:lb/targetGroup:TargetGroup",
      "aws:lb/listener:Listener",
      "aws:appautoscaling/target:Target",
      "aws:appautoscaling/policy:Policy",
    ]),
  );

  const target = resource(resources, "aws:lb/targetGroup:TargetGroup");
  expect(target.inputs.healthCheck).toMatchObject({
    path: "/_zsys/v1/health/ready",
    protocol: "HTTP",
  });
  const service = resource(resources, "aws:ecs/service:Service");
  expect(service.inputs).toMatchObject({ desiredCount: 1, launchType: "FARGATE" });
  const scalingTarget = resource(resources, "aws:appautoscaling/target:Target");
  expect(scalingTarget.inputs).toMatchObject({ minCapacity: 1, maxCapacity: 4 });
  const policy = resource(resources, "aws:appautoscaling/policy:Policy");
  expect(policy.inputs.targetTrackingScalingPolicyConfiguration).toMatchObject({
    targetValue: 70,
  });

  const definition = JSON.parse(
    await resolveOutput(application!.taskDefinition.containerDefinitions),
  );
  expect(definition[0]).toMatchObject({
    name: "web",
    user: "1000",
    readonlyRootFilesystem: true,
    stopTimeout: 30,
  });
  expect(definition[0].healthCheck.command.join(" ")).toContain("/_zsys/v1/health/live");
  expect(definition[0].logConfiguration.logDriver).toBe("awslogs");
  expect(application!.service.urn).toBeDefined();
  expect(resources.every(({ name }) => !name.includes("source.ts"))).toBe(true);
});

test("bounds generated IAM role names without dropping deterministic identity", () => {
  const componentName = "zsys-nightly-1787057916281-b4480e17-full-app-service";
  const executionRole = iamRoleName(componentName, "execution-role");
  const taskRole = iamRoleName(componentName, "task-role");

  expect(executionRole.length).toBeLessThanOrEqual(64);
  expect(taskRole.length).toBeLessThanOrEqual(64);
  expect(executionRole).not.toBe(taskRole);
  expect(executionRole).toBe(iamRoleName(componentName, "execution-role"));
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
