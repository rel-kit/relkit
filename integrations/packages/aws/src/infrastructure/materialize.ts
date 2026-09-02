import type { DeploymentInfrastructureIntegration } from "@relkit/deploy";
import { materializeRedis } from "./redis.js";
import { materializeS3 } from "./s3.js";

export const materializeAwsInfrastructure: DeploymentInfrastructureIntegration["materialize"] = (
  input,
) => {
  if (input.operation.capability === "bucket")
    return materializeS3(input.plan, input.stackName, input.operation);
  if (input.operation.capability === "cache")
    return materializeRedis(input.plan, input.stackName, input.operation, input.host);
  throw new TypeError(
    `AWS does not support infrastructure capability "${input.operation.capability}".`,
  );
};
