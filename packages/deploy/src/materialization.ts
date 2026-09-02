import type { DeploymentIntegrationMetadata } from "./integration.js";
import type { AccessOperationPlan, InfrastructureOperationPlan } from "./plan-integrations.js";
import type { DeploymentPlan } from "./plan.js";

export type DeploymentPrimitive = string | number | boolean | null;
export type DeploymentInput =
  | DeploymentPrimitive
  | DeploymentExpression
  | readonly DeploymentInput[]
  | Readonly<{ [key: string]: DeploymentInput }>;

export type DeploymentExpression =
  | DeploymentOutputExpression
  | DeploymentConfigurationExpression
  | DeploymentBindingExpression
  | DeploymentJoinExpression
  | DeploymentJsonExpression;

export interface DeploymentOutputExpression {
  readonly kind: "deployment-output";
  readonly resourceId: string;
  readonly property: string;
}

export interface DeploymentConfigurationExpression {
  readonly kind: "deployment-configuration";
  readonly name: string;
  readonly sensitive: boolean;
  readonly fallback?: DeploymentPrimitive;
}

export interface DeploymentBindingExpression {
  readonly kind: "deployment-binding";
  readonly bindingId: string;
  readonly field: string;
}

export interface DeploymentJoinExpression {
  readonly kind: "deployment-join";
  readonly values: readonly DeploymentInput[];
}

export interface DeploymentJsonExpression {
  readonly kind: "deployment-json";
  readonly value: DeploymentInput;
}

export interface DeploymentResourceOperation {
  readonly kind: "deployment-resource";
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly inputs: Readonly<Record<string, DeploymentInput>>;
  readonly outputs?: readonly string[];
  readonly parent?: string;
  readonly dependsOn?: readonly string[];
}

export interface DeploymentHostMaterialization {
  readonly resources: readonly DeploymentResourceOperation[];
  readonly network: Readonly<{
    vpcId: DeploymentInput;
    subnetIds: readonly DeploymentInput[];
    serviceSecurityGroupId: DeploymentInput;
  }>;
  readonly workload: Readonly<{
    roleName: DeploymentInput;
    roleArn: DeploymentInput;
  }>;
  readonly outputs: Readonly<Record<string, DeploymentInput>>;
}

export interface DeploymentInfrastructureMaterialization {
  readonly resources: readonly DeploymentResourceOperation[];
  readonly connection: Readonly<Record<string, DeploymentInput>>;
  readonly access: Readonly<Record<string, DeploymentInput>>;
}

export interface DeploymentAccessMaterialization {
  readonly resources: readonly DeploymentResourceOperation[];
}

export interface DeploymentHostIntegration extends DeploymentIntegrationMetadata<string, "host"> {
  readonly materialize: (input: {
    readonly plan: DeploymentPlan;
    readonly stackName: string;
  }) => DeploymentHostMaterialization;
}

export interface DeploymentInfrastructureIntegration extends DeploymentIntegrationMetadata<
  string,
  "infrastructure"
> {
  readonly materialize: (input: {
    readonly plan: DeploymentPlan;
    readonly stackName: string;
    readonly operation: InfrastructureOperationPlan;
    readonly host: DeploymentHostMaterialization;
  }) => DeploymentInfrastructureMaterialization;
}

export interface DeploymentAccessIntegration extends DeploymentIntegrationMetadata<
  string,
  "access"
> {
  readonly materialize: (input: {
    readonly plan: DeploymentPlan;
    readonly stackName: string;
    readonly operation: AccessOperationPlan;
    readonly host: DeploymentHostMaterialization;
    readonly infrastructure: DeploymentInfrastructureMaterialization;
  }) => DeploymentAccessMaterialization;
}

export interface DeploymentProgramMaterialization {
  readonly resources: readonly DeploymentResourceOperation[];
  readonly bindings: Readonly<Record<string, Readonly<Record<string, DeploymentInput>>>>;
  readonly outputs: Readonly<Record<string, DeploymentInput>>;
}

export function deploymentOutput(resourceId: string, property: string): DeploymentOutputExpression {
  return Object.freeze({ kind: "deployment-output", resourceId, property });
}

export function deploymentConfiguration(
  name: string,
  options: { readonly sensitive?: boolean; readonly fallback?: DeploymentPrimitive } = {},
): DeploymentConfigurationExpression {
  return Object.freeze({
    kind: "deployment-configuration",
    name,
    sensitive: options.sensitive ?? false,
    ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
  });
}

export function deploymentBinding(bindingId: string, field: string): DeploymentBindingExpression {
  return Object.freeze({ kind: "deployment-binding", bindingId, field });
}

export function deploymentJoin(...values: readonly DeploymentInput[]): DeploymentJoinExpression {
  return Object.freeze({ kind: "deployment-join", values: Object.freeze(values) });
}

export function deploymentJson(value: DeploymentInput): DeploymentJsonExpression {
  return Object.freeze({ kind: "deployment-json", value });
}
