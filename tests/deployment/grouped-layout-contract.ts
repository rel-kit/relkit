/** Compares native graph diffs and offline deployment/Pulumi programs from actual paired flat and grouped compiler outputs without resource acquisition. */
import assert from "node:assert/strict";
import {
  diffGraph,
  validateGraphShape,
  type ApplicationGraph,
} from "../../packages/graph/src/index.js";
import { fromGraph, diffDeploymentPlans } from "../../packages/deploy/src/index.js";
import { renderPulumiProgram } from "../../packages/deploy-pulumi/src/program.js";
import type { NormalizedGraph } from "../../packages/compiler/src/normalize-graph-types.js";

/**
 * Admits the compiler's graph projection only after the native graph validator proves its contract.
 * @param graph - Actual canonical compiler result.
 * @returns The native SDK graph ABI, preserving every node/edge and object identity.
 */
function nativeGraph(graph: NormalizedGraph): ApplicationGraph {
  validateGraphShape(graph);
  // Compiler and graph SDK expose different static projections of the same validated native contract.
  return graph as ApplicationGraph;
}

/**
 * Supplies explicit offline deployment roles equally to both layout fixtures; no provider client is acquired.
 * @param graph - Validated compiled graph.
 * @returns A deployment candidate with identical explicit role declarations in both layouts.
 */
function deploymentGraph(graph: ApplicationGraph): ApplicationGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.kind === "app"
        ? {
            ...node,
            deploymentRoles: [
              { role: "engine", integrationId: "pulumi", protocolVersion: 1, configuration: {} },
              { role: "host", integrationId: "aws", protocolVersion: 1, configuration: {} },
            ],
          }
        : node,
    ),
  };
}

/**
 * Executes native compatibility planning for a real paired source move.
 * @param before - Flat canonical compiler graph.
 * @param after - Grouped canonical compiler graph.
 * @returns Completion after graph/deployment diff and deterministic Pulumi rendering assertions.
 */
export function assertGroupedDeployment(before: NormalizedGraph, after: NormalizedGraph): void {
  const leftGraph = nativeGraph(before),
    rightGraph = nativeGraph(after);
  const graphDiff = diffGraph(leftGraph, rightGraph);
  assert.equal(graphDiff.hasBreakingChanges, false);
  assert.ok(graphDiff.changes.some((change) => change.change === "source-moved"));
  assert.ok(graphDiff.changes.every((change) => change.change === "source-moved"));
  const [left, right] = groupedDeploymentPlans(before, after);
  const diff = diffDeploymentPlans(left, right);
  assert.equal(diff.hasDestructiveChanges, false);
  assert.ok(
    diff.changes.every((change) => change.operation !== "replace" && change.operation !== "delete"),
  );
  assert.deepEqual(left.iam, right.iam);
  const options = {
    projectRoot: "/offline",
    stackName: "CI/grouped-layout",
    integrationImports: [
      {
        integrationId: "pulumi",
        role: "engine" as const,
        packageName: "@relkit/pulumi",
        packageVersion: "0.7.5",
        exportName: "./engine",
      },
      {
        integrationId: "aws",
        role: "host" as const,
        packageName: "@relkit/aws",
        packageVersion: "0.7.5",
        exportName: "./host",
      },
    ],
  };
  const leftProgram = renderPulumiProgram(left, options),
    rightProgram = renderPulumiProgram(right, options);
  assert.equal(rightProgram.pulumiYaml, leftProgram.pulumiYaml);
  assert.equal(
    rightProgram.indexTs.replaceAll(right.graphHash, "<graph-hash>"),
    leftProgram.indexTs.replaceAll(left.graphHash, "<graph-hash>"),
  );
  assert.equal(
    rightProgram.planJson.replaceAll(right.graphHash, "<graph-hash>"),
    leftProgram.planJson.replaceAll(left.graphHash, "<graph-hash>"),
  );
}

/**
 * Produces actual offline plans for the paired canonical compiler graphs using identical explicit deployment roles.
 * @param before - Flat canonical compiler graph.
 * @param after - Grouped canonical compiler graph.
 * @returns The two native plans without changing policy, bindings or nested public contracts.
 */
export function groupedDeploymentPlans(before: NormalizedGraph, after: NormalizedGraph) {
  return [
    fromGraph(deploymentGraph(nativeGraph(before))),
    fromGraph(deploymentGraph(nativeGraph(after))),
  ] as const;
}
