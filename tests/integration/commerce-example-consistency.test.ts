import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { generateClient } from "../../packages/client-generator/src/index.ts";
import { renderPulumiProgram } from "../../packages/deploy-pulumi/src/program.ts";
import { fromGraph } from "../../packages/deploy/src/index.ts";
import {
  createRegistrationPlan,
  hashGraph,
  type ApplicationGraph,
} from "../../packages/graph/src/index.ts";
import { generateOpenApiJson } from "../../packages/openapi/src/index.ts";
import { compileProject } from "../compiler/fixture-runner.ts";

const APP_ROOT = resolve(import.meta.dir, "../../examples/commerce");

test("commerce-example keeps one graph and hash across acceptance consumers", async () => {
  const compiled = await compileProject("commerce-example", APP_ROOT);
  const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;
  const graphHash = hashGraph(graph);
  const registration = createRegistrationPlan(graph, { projectRoot: "/fixture" });
  const deployment = fromGraph(graph, {
    image: {
      name: "registry.example/commerce-example",
      tag: "acceptance",
      health: {
        livenessPath: "/_relkit/v1/health/live",
        readinessPath: "/_relkit/v1/health/ready",
        port: 3000,
      },
    },
  });
  const pulumi = renderPulumiProgram(deployment, {
    projectRoot: "/tmp/commerce-example-acceptance",
    stackName: "acceptance",
    integrationImports: [
      {
        integrationId: "pulumi",
        role: "engine",
        packageName: "@relkit/pulumi",
        packageVersion: "0.1.0",
        exportName: "./engine",
      },
      {
        integrationId: "aws",
        role: "host",
        packageName: "@relkit/aws",
        packageVersion: "0.1.0",
        exportName: "./host",
      },
      {
        integrationId: "aws",
        role: "infrastructure",
        packageName: "@relkit/aws",
        packageVersion: "0.1.0",
        exportName: "./infrastructure",
      },
      {
        integrationId: "aws",
        role: "access",
        packageName: "@relkit/aws",
        packageVersion: "0.1.0",
        exportName: "./access",
      },
    ],
  });

  expect(compiled.diagnostics).toEqual([]);
  expect(compiled.exitCode).toBe(0);
  expect(compiled.graphHash).toBe(graphHash);
  expect(registration.graphHash).toBe(graphHash);
  expect(deployment.graphHash).toBe(graphHash);
  expect(JSON.parse(pulumi.planJson).graphHash).toBe(graphHash);
  expect(pulumi.indexTs).toContain("export const graphHash = plan.graphHash;");
  expect(compiled.manifest).toContain(`manifestGraphHash = ${JSON.stringify(graphHash)}`);
  expect(compiled.normalization.outputs.openapi).toBe(generateOpenApiJson(graph));
  expect(compiled.normalization.outputs.client).toBe(generateClient(graph));
});
