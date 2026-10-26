/** Resolves packed selected role exports and executes actual AWS materializers through the native Pulumi mock monitor. */
import assert from "node:assert/strict";
import { isAbsolute, relative } from "node:path";
import { resolveIntegrationPackageRole } from "@relkit/compiler";
import { assertDeploymentPlanVersion } from "@relkit/deploy";
import {
  materializeDeploymentOperations,
  materializePulumiDeployment,
} from "@relkit/deploy-pulumi";
import { awsHost } from "@relkit/aws/host";
import { awsInfrastructure } from "@relkit/aws/infrastructure";
import { awsAccess } from "@relkit/aws/access";
import { pulumiEngine } from "@relkit/pulumi/engine";
import * as pulumi from "@pulumi/pulumi";
import { plan } from "./packed-deployment-plan.fixture.js";

/** Requires actual contained role resolution and deploy-only native SDK metadata. */
function resolveSelectedRoles() {
  return (
    [
      ["pulumi", "engine"],
      ["aws", "host"],
      ["aws", "infrastructure"],
      ["aws", "access"],
    ] as const
  ).map(([integrationId, role]) => {
    const selected = resolveIntegrationPackageRole({
      projectRoot: process.cwd(),
      packageName: `@relkit/${integrationId}`,
      integrationId,
      role,
    });
    const path = relative(process.cwd(), selected.resolvedPath);
    assert.ok(path !== ".." && !path.startsWith("../") && !isAbsolute(path));
    assert.equal(selected.exportName, `./${role}`);
    assert.ok(
      selected.requirements?.some(
        (requirement) =>
          requirement.package === `@pulumi/${integrationId === "aws" ? "aws" : "pulumi"}` &&
          requirement.phases.includes("deploy") &&
          !requirement.phases.includes("runtime"),
      ),
    );
    return selected;
  });
}

/** Uses the existing native mock registration barrier instead of assuming resource construction settled. */
async function installMocks(expected: number, resources: { type: string; name: string }[]) {
  const registered = Promise.withResolvers<void>();
  await pulumi.runtime.setMocks(
    {
      newResource: (args) => {
        if (args.type !== "pulumi:pulumi:Stack")
          resources.push({ type: args.type, name: args.name });
        if (resources.length === expected) registered.resolve();
        return {
          id: `${args.name}-id`,
          state: {
            ...args.inputs,
            id: `${args.name}-id`,
            arn: `arn:test:${args.name}`,
            name: args.name,
            dnsName: `${args.name}.test`,
            repositoryUrl: `registry.test/${args.name}`,
            region: "us-east-1",
            bucket: args.name,
            primaryEndpointAddress: `${args.name}.cache.test`,
            port: 6379,
          },
        };
      },
      call: (args) => args.inputs,
    },
    "relkit-packed-offline",
    "acceptance",
  );
  if (expected === 0) registered.resolve();
  return { registered: registered.promise };
}

const roles = resolveSelectedRoles();
assertDeploymentPlanVersion(plan);
const integrations = [pulumiEngine, awsHost, awsInfrastructure, awsAccess];
const operations = materializeDeploymentOperations(plan, { stackName: "acceptance", integrations });
const resources: { type: string; name: string }[] = [];
const mocks = await installMocks(operations.resources.length, resources);
await pulumi.runtime.runInPulumiStack(async () => {
  const output = materializePulumiDeployment(plan, { stackName: "acceptance", integrations });
  assert.equal(output.resourceCount, operations.resources.length);
});
await mocks.registered;
assert.equal(resources.length, operations.resources.length);
assert.ok(resources.some((resource) => resource.type === "aws:ecs/service:Service"));
assert.ok(
  resources.some(
    (resource) => resource.type === "aws:elasticache/replicationGroup:ReplicationGroup",
  ),
);
assert.ok(
  resources.some((resource) => resource.type === "aws:ec2/securityGroupRule:SecurityGroupRule"),
);
assert.equal(
  new Set(resources.map((resource) => `${resource.type}:${resource.name}`)).size,
  resources.length,
);
process.stdout.write(JSON.stringify({ roles, resources, engine: "native-pulumi-mocks" }) + "\n");
