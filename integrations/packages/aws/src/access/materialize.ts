import {
  deploymentJson,
  type DeploymentAccessIntegration,
  type DeploymentInput,
  type DeploymentResourceOperation,
} from "@relkit/deploy";

export const materializeAwsAccess: DeploymentAccessIntegration["materialize"] = (input) => {
  const infrastructure = input.plan.infrastructureOperations.find(
    (entry) => entry.bindingId === input.operation.bindingId,
  );
  if (infrastructure?.capability === "bucket") return bucketAccess(input);
  if (infrastructure?.capability === "cache") return cacheAccess(input);
  throw new TypeError(`AWS access for "${input.operation.bindingId}" is unsupported.`);
};

function bucketAccess(input: Parameters<DeploymentAccessIntegration["materialize"]>[0]): {
  readonly resources: readonly DeploymentResourceOperation[];
} {
  const actions = actionList(input.operation.integration.configuration);
  const list = actions.filter((action) => action === "s3:ListBucket");
  const objects = actions.filter((action) => action !== "s3:ListBucket");
  const statements = [
    ...(list.length === 0
      ? []
      : [
          {
            Effect: "Allow",
            Action: list,
            Resource: required(input.infrastructure.access.bucketArn, "bucket ARN"),
          },
        ]),
    ...(objects.length === 0
      ? []
      : [
          {
            Effect: "Allow",
            Action: objects,
            Resource: required(input.infrastructure.access.objectArn, "object ARN"),
          },
        ]),
  ];
  return {
    resources:
      statements.length === 0
        ? []
        : [
            operation(input, "bucket-policy", "aws:iam/rolePolicy:RolePolicy", {
              role: input.host.workload.roleName,
              policy: deploymentJson({ Version: "2012-10-17", Statement: statements }),
            }),
          ],
  };
}

function cacheAccess(input: Parameters<DeploymentAccessIntegration["materialize"]>[0]): {
  readonly resources: readonly DeploymentResourceOperation[];
} {
  return {
    resources: [
      operation(input, "cache-ingress", "aws:ec2/securityGroupRule:SecurityGroupRule", {
        type: "ingress",
        fromPort: number(input.infrastructure.access.port, "cache port"),
        toPort: number(input.infrastructure.access.port, "cache port"),
        protocol: "tcp",
        securityGroupId: required(input.infrastructure.access.securityGroupId, "cache group"),
        sourceSecurityGroupId: input.host.network.serviceSecurityGroupId,
      }),
    ],
  };
}

function operation(
  input: Parameters<DeploymentAccessIntegration["materialize"]>[0],
  suffix: string,
  type: string,
  values: Readonly<Record<string, DeploymentInput>>,
): DeploymentResourceOperation {
  const id = `aws.access.${input.operation.bindingId}.${suffix}`;
  return {
    kind: "deployment-resource",
    id,
    type,
    name: id
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .slice(0, 63),
    inputs: values,
  };
}

function actionList(value: unknown): string[] {
  const actions = record(value).actions;
  const allowed = new Set(["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]);
  if (!Array.isArray(actions) || actions.some((action) => !allowed.has(String(action))))
    throw new TypeError("AWS S3 access actions are invalid.");
  return [...new Set(actions as string[])].sort();
}

function required(value: DeploymentInput | undefined, label: string): DeploymentInput {
  if (value === undefined) throw new TypeError(`AWS ${label} output is missing.`);
  return value;
}

function number(value: DeploymentInput | undefined, label: string): number {
  if (typeof value !== "number") throw new TypeError(`AWS ${label} output is invalid.`);
  return value;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
