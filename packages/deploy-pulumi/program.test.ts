import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deploymentOutput,
  type DeploymentHostIntegration,
  type DeploymentIntegrationMetadata,
  type DeploymentPlan,
} from "@relkit/deploy";
import * as pulumi from "@pulumi/pulumi";
import type { MockResourceArgs } from "@pulumi/pulumi/runtime/mocks";
import {
  PULUMI_PROGRAM_VERSION,
  createPulumiProgram,
  renderPulumiProgram,
  writePulumiProgram,
} from "./src/program.ts";

const roots: string[] = [];
const engine = Object.freeze({
  kind: "deployment-integration",
  protocolVersion: 1,
  integrationId: "pulumi",
  role: "engine",
}) satisfies DeploymentIntegrationMetadata<"pulumi", "engine">;
const host = Object.freeze({
  kind: "deployment-integration",
  protocolVersion: 1,
  integrationId: "test-host",
  role: "host",
  materialize: () => ({
    resources: [
      {
        kind: "deployment-resource",
        id: "test.host",
        type: "test:index:Host",
        name: "test-host",
        inputs: { value: "ready" },
        outputs: ["endpoint"],
      },
    ],
    network: { vpcId: "vpc", subnetIds: ["subnet"], serviceSecurityGroupId: "sg" },
    workload: { roleName: "role", roleArn: "arn:test:role" },
    outputs: { endpoint: deploymentOutput("test.host", "endpoint") },
  }),
}) satisfies DeploymentHostIntegration;
const integrationImports = [
  {
    integrationId: "pulumi",
    role: "engine" as const,
    packageName: "@relkit/pulumi",
    packageVersion: "0.1.0",
    exportName: "./engine",
  },
  {
    integrationId: "test-host",
    role: "host" as const,
    packageName: "@example/test-host",
    packageVersion: "1.0.0",
    exportName: "./host",
  },
];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pulumi program generation", () => {
  test("materializes generic operations through Pulumi mocks", async () => {
    const resources: Array<{ readonly type: string; readonly name: string }> = [];
    await pulumi.runtime.setMocks(
      {
        newResource: (args: MockResourceArgs) => {
          resources.push({ type: args.type, name: args.name });
          return {
            id: `${args.name}-id`,
            state: { ...args.inputs, endpoint: "https://example.test" },
          };
        },
        call: (args) => args.inputs,
      },
      "relkit-program-test",
      "development",
    );
    let outputs: Record<string, unknown> | undefined;
    await pulumi.runtime.runInPulumiStack(async () => {
      outputs = await createPulumiProgram(plan(), {
        stackName: "development",
        integrations: [engine, host],
      })();
    });
    await Bun.sleep(50);
    expect(resources.filter((entry) => entry.type === "test:index:Host")).toEqual([
      { type: "test:index:Host", name: "test-host" },
    ]);
    expect(outputs).toMatchObject({ graphHash: "sha256:graph", resourceCount: 1 });
  });

  test("renders stable selected integration imports without AWS hardcoding", () => {
    const left = renderPulumiProgram(plan(), {
      projectRoot: "/tmp/relkit-left",
      stackName: "CI/blue",
      integrationImports,
    });
    const right = renderPulumiProgram(plan(), {
      projectRoot: "/tmp/relkit-right",
      stackName: "CI/blue",
      integrationImports: [...integrationImports].reverse(),
    });
    expect(left.pulumiYaml).toBe(right.pulumiYaml);
    expect(left.indexTs).toBe(right.indexTs);
    expect(left.planJson).toBe(right.planJson);
    expect(left.indexTs).toContain("materializePulumiDeployment");
    expect(left.indexTs).toContain("@relkit/pulumi/engine");
    expect(left.indexTs).toContain("@example/test-host/host");
    expect(left.indexTs).not.toContain("createAwsPulumiResources");
    expect(left.indexTs).not.toContain("/tmp/relkit-");
    expect(PULUMI_PROGRAM_VERSION).toBe(1);
  });

  test("writes the deterministic selected-engine project files", async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-program-test-"));
    roots.push(root);
    const files = await writePulumiProgram(plan(), {
      projectRoot: root,
      stackName: "development",
      integrationImports,
    });
    const directory = join(root, ".relkit", "generated", "pulumi");
    expect(await readFile(join(directory, "Pulumi.yaml"), "utf8")).toBe(files.pulumiYaml);
    expect(await readFile(join(directory, "index.ts"), "utf8")).toBe(files.indexTs);
    expect(JSON.parse(await readFile(join(directory, "plan.json"), "utf8"))).toEqual(plan());
  });
});

function plan(): DeploymentPlan {
  return {
    contractVersion: 3,
    graphHash: "sha256:graph",
    application: {
      id: "orders-app",
      image: {
        name: "orders",
        tag: "latest",
        health: { livenessPath: "/live", readinessPath: "/ready", port: 3000 },
      },
      environmentNames: [],
    },
    engine: { role: "engine", integrationId: "pulumi", protocolVersion: 1, configuration: {} },
    host: { role: "host", integrationId: "test-host", protocolVersion: 1, configuration: {} },
    connectedBindings: [],
    infrastructureOperations: [],
    accessOperations: [],
    http: {
      logicalName: "orders-http",
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
