import {
  deploymentConfiguration,
  deploymentOutput,
  type DeploymentInput,
  type DeploymentPlan,
  type DeploymentResourceOperation,
} from "@relkit/deploy";

export interface HostContext {
  readonly plan: DeploymentPlan;
  readonly stackName: string;
  readonly prefix: string;
  readonly tags: Readonly<Record<string, string>>;
  readonly region: DeploymentInput;
}

export function hostContext(plan: DeploymentPlan, stackName: string): HostContext {
  const prefix = name(`${stackName}-${plan.application.id}`);
  return {
    plan,
    stackName,
    prefix,
    tags: {
      app: plan.application.id,
      stack: stackName,
      graphHash: plan.graphHash,
      "managed-by": "relkit",
    },
    region: deploymentConfiguration("aws:region", { fallback: "us-east-1" }),
  };
}

export function resource(
  context: HostContext,
  id: string,
  type: string,
  inputs: Readonly<Record<string, DeploymentInput>>,
  outputs: readonly string[] = [],
  dependsOn: readonly string[] = [],
): DeploymentResourceOperation {
  return {
    kind: "deployment-resource",
    id: hostId(id),
    type,
    name: name(`${context.prefix}-${id}`),
    inputs,
    ...(outputs.length === 0 ? {} : { outputs }),
    ...(dependsOn.length === 0 ? {} : { dependsOn: dependsOn.map(hostId) }),
  };
}

export function hostId(id: string): string {
  return `aws.host.${id}`;
}

export function output(id: string, property: string): DeploymentInput {
  return deploymentOutput(hostId(id), property);
}

export function name(value: string, max = 63): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+/, "")
      .replace(/(?<!-)-+$/, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "relkit"
  );
}
