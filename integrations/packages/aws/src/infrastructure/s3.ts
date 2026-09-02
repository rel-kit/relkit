import {
  deploymentJoin,
  type DeploymentInfrastructureMaterialization,
  type DeploymentPlan,
  type InfrastructureOperationPlan,
} from "@relkit/deploy";
import { assertAdapter, context, output, resource, settings } from "./shared.js";

export function materializeS3(
  plan: DeploymentPlan,
  stackName: string,
  operation: InfrastructureOperationPlan,
): DeploymentInfrastructureMaterialization {
  assertAdapter(operation, "bucket", "s3", ["signedReadUrl", "signedWriteUrl"]);
  const value = context(plan.application.id, plan.graphHash, stackName, operation);
  const options = settings(operation.integration.configuration);
  assertOptions(options);
  const bucket = resource(
    value,
    "bucket",
    "aws:s3/bucket:Bucket",
    {
      forceDestroy: options.forceDestroy === true,
      versioning: { enabled: options.versioning === true },
      tags: value.tags,
    },
    ["arn", "bucket", "region"],
  );
  const arn = output(value, "bucket", "arn");
  return {
    resources: [bucket],
    connection: {
      endpoint: deploymentJoin("https://s3.", value.region, ".amazonaws.com"),
      bucketName: output(value, "bucket", "bucket"),
      region: output(value, "bucket", "region"),
    },
    access: { bucketArn: arn, objectArn: deploymentJoin(arn, "/*") },
  };
}

function assertOptions(options: Readonly<Record<string, unknown>>): void {
  for (const key of Object.keys(options))
    if (key !== "versioning" && key !== "forceDestroy")
      throw new TypeError(`Unknown AWS S3 option "${key}".`);
  for (const key of ["versioning", "forceDestroy"])
    if (options[key] !== undefined && typeof options[key] !== "boolean")
      throw new TypeError(`AWS S3 ${key} must be a boolean.`);
}
