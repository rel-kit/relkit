import { afterEach, describe, expect, test } from "bun:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DeploymentPlan } from "@zsys/deploy";
import * as pulumi from "@pulumi/pulumi";
import type { MockResourceArgs } from "@pulumi/pulumi/runtime/mocks";
import { createAwsPulumiResources } from "./src/aws-program.ts";
import { imageValue } from "./src/aws-program-support.ts";
import { PULUMI_PROGRAM_VERSION, renderPulumiProgram, writePulumiProgram } from "./src/program.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pulumi program generation", () => {
  test("materializes only durable event triggers in AWS", async () => {
    const resources: Array<{ readonly type: string; readonly name: string }> = [];
    await pulumi.runtime.setMocks(
      {
        newResource: (args: MockResourceArgs) => {
          resources.push({ type: args.type, name: args.name });
          return {
            id: `${args.name}-id`,
            state: {
              ...args.inputs,
              arn: `arn:test:${args.name}`,
              name: args.inputs.name ?? args.name,
              publicSubnetIds: ["public-1"],
              privateSubnetIds: ["private-1"],
              bucket: `${args.name}.bucket`,
              endpoints: [{ address: "cache.test", port: 6379 }],
              repositoryUrl: `registry.test/${args.name}`,
              resourceId: `service/${args.name}`,
            },
          };
        },
        call: () => ({ region: "us-east-1", name: "us-east-1" }),
      },
      "zsys-program-test",
      "development",
    );
    await pulumi.runtime.runInPulumiStack(() => {
      createAwsPulumiResources({
        ...plan(),
        jobs: [
          {
            id: "receipts.send",
            logicalName: "receipts-job",
            configurationNames: [],
            targetFunctionId: "receipts.send",
            profile: "default",
          },
        ],
        events: [
          {
            id: "orders.created",
            logicalName: "orders-event",
            configurationNames: [],
            version: 1,
            payload: {},
          },
        ],
        eventTriggers: [
          {
            id: "telemetry.capture",
            logicalName: "telemetry-trigger",
            configurationNames: [],
            targetFunctionId: "telemetry.capture",
            expansion: [],
            delivery: "ephemeral",
          },
          {
            id: "orders.handle",
            logicalName: "orders-trigger",
            configurationNames: [],
            targetFunctionId: "orders.handle",
            expansion: ["orders.created@1"],
            delivery: "durable",
          },
        ],
        buckets: [
          {
            id: "assets",
            logicalName: "assets-bucket",
            configurationNames: [],
            profile: "default",
            visibility: "private",
          },
        ],
        caches: [
          {
            id: "prices",
            logicalName: "prices-cache",
            configurationNames: [],
            profile: "default",
          },
        ],
        iam: {
          serviceRole: {
            statements: [
              {
                capability: "jobs",
                actions: ["sqs:ReceiveMessage"],
                resources: ["orders-trigger"],
              },
            ],
          },
          perFunction: [],
        },
      });
    });
    await Bun.sleep(100);

    expect(
      resources.filter(({ type }) => type === "aws:cloudwatch/eventRule:EventRule"),
    ).toHaveLength(1);
    expect(resources.some(({ name }) => name.includes("telemetry-capture"))).toBe(false);
  });

  test("preserves an image name that already contains a tag", () => {
    expect(
      imageValue({
        ...plan(),
        application: {
          ...plan().application,
          image: {
            ...plan().application.image,
            tag: undefined,
            name: "123456789.dkr.ecr.us-east-1.amazonaws.com/smoke:release",
          },
        },
      }),
    ).toBe("123456789.dkr.ecr.us-east-1.amazonaws.com/smoke:release");
  });

  test("renders identical bytes from different project roots with stable identity metadata", () => {
    const left = renderPulumiProgram(plan(), {
      projectRoot: "/tmp/zsys-left",
      stackName: "CI/blue",
    });
    const right = renderPulumiProgram(plan(), {
      projectRoot: "/tmp/zsys-right",
      stackName: "CI/blue",
    });

    expect(left.pulumiYaml).toBe(right.pulumiYaml);
    expect(left.indexTs).toBe(right.indexTs);
    expect(left.planJson).toBe(right.planJson);
    expect(left.indexTs).toContain("createAwsPulumiResources");
    expect(left.indexTs).toContain('const stackName = "ci-blue";');
    expect(left.indexTs).toContain("@zsys/deploy-pulumi");
    expect(left.indexTs).not.toContain("zsys:deployment:application");
    expect(left.indexTs).not.toContain("/tmp/zsys-");
    expect(left.indexTs).not.toContain("source.ts");
    expect(left.indexTs).not.toContain("callback");
    expect(() =>
      renderPulumiProgram({ ...plan(), callback: () => undefined } as unknown as DeploymentPlan),
    ).toThrow();
    expect(renderPulumiProgram(plan(), { stackName: "production" }).indexTs).not.toBe(left.indexTs);
    expect(PULUMI_PROGRAM_VERSION).toBe(1);
  });

  test("writes exactly the deterministic Pulumi project files", async () => {
    const root = await mkdtemp(join(tmpdir(), "zsys-program-test-"));
    roots.push(root);
    const files = await writePulumiProgram(plan(), { projectRoot: root, stackName: "development" });
    const directory = join(root, ".zsys", "generated", "pulumi");

    expect(files.directory).toBe(directory);
    expect(await readFile(join(directory, "Pulumi.yaml"), "utf8")).toBe(files.pulumiYaml);
    expect(await readFile(join(directory, "index.ts"), "utf8")).toBe(files.indexTs);
    expect(await readFile(join(directory, "plan.json"), "utf8")).toBe(files.planJson);
    expect(JSON.parse(files.planJson)).toEqual(plan());
  });
});

function plan(): DeploymentPlan {
  return {
    contractVersion: 1,
    graphHash: "graph-123",
    application: {
      id: "orders.app",
      image: {
        name: "orders",
        tag: "latest",
        health: {
          livenessPath: "/_zsys/v1/health/live",
          readinessPath: "/_zsys/v1/health/ready",
          port: 3000,
        },
      },
      environmentNames: ["AWS_REGION"],
    },
    http: {
      logicalName: "orders-app-http-public",
      port: 3000,
      health: {
        livenessPath: "/_zsys/v1/health/live",
        readinessPath: "/_zsys/v1/health/ready",
        port: 3000,
      },
      routes: [
        { id: "orders.route", method: "GET", path: "/orders", targetFunctionId: "orders.list" },
      ],
      configurationNames: ["AWS_REGION"],
    },
    jobs: [],
    schedules: [],
    events: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    iam: { serviceRole: { statements: [] }, perFunction: [] },
    observability: {
      logicalName: "orders-app-observability-default",
      configurationNames: [],
      logs: true,
      traces: true,
    },
  };
}
