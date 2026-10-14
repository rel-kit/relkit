/** Builds original pure registration/deployment/Pulumi outputs from the same native graph; rendering acquires no cloud resources. */
import {
  createRegistrationPlan,
  type ApplicationGraph,
} from "../../../packages/graph/src/index.ts";
import { fromGraph } from "../../../packages/deploy/src/index.ts";
import { renderPulumiProgram } from "../../../packages/deploy-pulumi/src/program.ts";

const integrationImports: NonNullable<
  NonNullable<Parameters<typeof renderPulumiProgram>[1]>["integrationImports"]
> = [
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
];

/** Constructs every original deployment consumer from one graph without invoking a provider.
 * @param graph - Native validated and identity-stabilized compiler output.
 * @returns Original registration, deployment plan and rendered Pulumi bytes for exact assertions. */
export function commerceConsumerOutputs(graph: ApplicationGraph) {
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
    integrationImports,
  });
  return { registration, deployment, pulumi };
}
