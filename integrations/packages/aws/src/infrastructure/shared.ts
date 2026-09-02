import {
  deploymentConfiguration,
  deploymentOutput,
  type DeploymentInput,
  type DeploymentResourceOperation,
  type InfrastructureOperationPlan,
} from "@relkit/deploy";

export interface InfrastructureContext {
  readonly stackName: string;
  readonly operation: InfrastructureOperationPlan;
  readonly prefix: string;
  readonly tags: Readonly<Record<string, string>>;
  readonly region: DeploymentInput;
}

export function context(
  appId: string,
  graphHash: string,
  stackName: string,
  operation: InfrastructureOperationPlan,
): InfrastructureContext {
  return {
    stackName,
    operation,
    prefix: name(`${stackName}-${appId}-${operation.bindingId}`),
    tags: { app: appId, stack: stackName, graphHash, "managed-by": "relkit" },
    region: deploymentConfiguration("aws:region", { fallback: "us-east-1" }),
  };
}

export function resource(
  context: InfrastructureContext,
  suffix: string,
  type: string,
  inputs: Readonly<Record<string, DeploymentInput>>,
  outputs: readonly string[] = [],
): DeploymentResourceOperation {
  return {
    kind: "deployment-resource",
    id: id(context, suffix),
    type,
    name: name(`${context.prefix}-${suffix}`),
    inputs,
    ...(outputs.length === 0 ? {} : { outputs }),
  };
}

export function output(
  context: InfrastructureContext,
  suffix: string,
  property: string,
): DeploymentInput {
  return deploymentOutput(id(context, suffix), property);
}

export function id(context: InfrastructureContext, suffix: string): string {
  return `aws.infrastructure.${context.operation.bindingId}.${suffix}`;
}

export function name(value: string, max = 63): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "relkit"
  );
}

export function settings(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export function assertAdapter(
  operation: InfrastructureOperationPlan,
  capability: string,
  adapterId: string,
  features: readonly string[],
): void {
  if (
    operation.capability !== capability ||
    operation.adapter.integrationId !== adapterId ||
    operation.adapter.adapterId !== adapterId ||
    operation.adapter.protocolVersion !== 1 ||
    operation.adapter.features.some((feature) => !features.includes(feature))
  )
    throw new TypeError(
      `AWS does not support ${operation.capability}:${operation.adapter.integrationId}:${operation.adapter.adapterId}.`,
    );
}
