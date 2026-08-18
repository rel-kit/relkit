import { afterEach, describe, expect, test } from "bun:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DeploymentPlan } from "@zsys/deploy";
import { PULUMI_PROGRAM_VERSION, renderPulumiProgram, writePulumiProgram } from "./src/program.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pulumi program generation", () => {
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
    expect(left.indexTs).toContain('"managed-by":"zsys"');
    expect(left.indexTs).toContain('"stack":"ci-blue"');
    expect(left.indexTs).toContain("zsys:deployment:application");
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
