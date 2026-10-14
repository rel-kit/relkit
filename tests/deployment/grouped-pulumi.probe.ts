/** Materializes one validated paired compiler deployment plan through real AWS role code and native Pulumi mocks without cloud access. */
import { Effect, Schema } from "effect";
import * as pulumi from "../../packages/deploy-pulumi/node_modules/@pulumi/pulumi/index.js";
import { assertDeploymentPlanShape } from "../../packages/deploy/src/plan-validation.js";
import { materializeDeploymentOperations } from "../../packages/deploy-pulumi/src/materialization.js";
import { materializePulumiDeployment } from "../../packages/deploy-pulumi/src/program.js";
import { awsAccess } from "../../integrations/packages/aws/src/access/index.js";
import { awsHost } from "../../integrations/packages/aws/src/host/index.js";
import { awsInfrastructure } from "../../integrations/packages/aws/src/infrastructure/index.js";
import { pulumiEngine } from "../../integrations/packages/pulumi/src/engine/index.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";
import type { RegisteredMockResource } from "./grouped-pulumi.types.js";

/**
 * Runs one isolated native mock engine so duplicate stack/cohort state cannot influence the comparison.
 * @param path - Test-owned native deployment plan JSON.
 * @returns The complete registered native resource type/name projection after mock registration settles.
 */
const materialize = Effect.fn("GroupedPulumi.materialize")((path: string) =>
  scaffoldNative("grouped.pulumi.native", async () => {
    const raw = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(
      await Bun.file(path).text(),
    );
    assertDeploymentPlanShape(raw);
    const names = new Set([
      ...raw.application.environmentNames,
      ...raw.connectedBindings.flatMap((binding) => binding.namedValues.map((value) => value.name)),
      ...raw.infrastructureOperations.flatMap((binding) =>
        binding.namedValues.map((value) => value.name),
      ),
    ]);
    pulumi.runtime.setAllConfig(
      Object.fromEntries(
        [...names].map((name) => [
          "relkit-grouped-layout:" + name,
          name.includes("URL") ? "redis://localhost:6379" : "native-mock-value",
        ]),
      ),
    );
    const integrations = [pulumiEngine, awsHost, awsInfrastructure, awsAccess];
    const operations = materializeDeploymentOperations(raw, { stackName: "layout", integrations });
    const resources: RegisteredMockResource[] = [];
    const mocks = await installMocks(operations.resources.length, resources);
    await pulumi.runtime.runInPulumiStack(async () => {
      materializePulumiDeployment(raw, { stackName: "layout", integrations });
    });
    await mocks.registered;
    return resources.sort((left, right) =>
      `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`),
    );
  }),
);

/**
 * Installs one native mock monitor and a registration barrier before resource construction begins.
 * @param expected - Exact resource count from the actual native role materialization.
 * @param resources - Invocation-local identity observations.
 * @returns The barrier that resolves after every planned resource is registered.
 */
async function installMocks(expected: number, resources: RegisteredMockResource[]) {
  const registered = Promise.withResolvers<void>();
  await pulumi.runtime.setMocks(
    {
      newResource: (args) => {
        if (args.type !== "pulumi:pulumi:Stack")
          resources.push({ type: args.type, name: args.name });
        if (resources.length === expected) registered.resolve();
        return {
          id: args.name + "-id",
          state: {
            ...args.inputs,
            id: args.name + "-id",
            arn: "arn:test:" + args.name,
            name: args.name,
            dnsName: args.name + ".test",
            repositoryUrl: "registry.test/" + args.name,
            region: "us-east-1",
            bucket: args.name,
            primaryEndpointAddress: args.name + ".cache.test",
            port: 6379,
          },
        };
      },
      call: (args) => args.inputs,
    },
    "relkit-grouped-layout",
    "layout",
  );
  if (expected === 0) registered.resolve();
  return { registered: registered.promise };
}

const path = process.argv[2];
if (!path) throw new Error("A test-owned deployment plan path is required");
const result = await Effect.runPromise(materialize(path));
process.stdout.write(JSON.stringify(result) + "\n");
