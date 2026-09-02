import type {
  DeploymentAccessIntegration,
  DeploymentHostIntegration,
  DeploymentInfrastructureIntegration,
  DeploymentInfrastructureMaterialization,
  DeploymentInput,
  DeploymentIntegrationMetadata,
  DeploymentIntegrationPlan,
  DeploymentIntegrationRole,
  DeploymentPlan,
  DeploymentProgramMaterialization,
  DeploymentResourceOperation,
} from "@relkit/deploy";
import { deploymentConfiguration } from "@relkit/deploy";
import { assertDeploymentPlanVersion } from "@relkit/deploy";

export interface MaterializeDeploymentOptions {
  readonly stackName: string;
  readonly integrations: readonly unknown[];
}

export function materializeDeploymentOperations(
  plan: DeploymentPlan,
  options: MaterializeDeploymentOptions,
): DeploymentProgramMaterialization {
  assertDeploymentPlanVersion(plan);
  const integrations = integrationMap(options.integrations);
  required(integrations, plan.engine, "engine");
  if (plan.engine.integrationId !== "pulumi")
    throw new TypeError(`Pulumi cannot execute engine "${plan.engine.integrationId}".`);
  const hostIntegration = required(integrations, plan.host, "host");
  assertFunction(hostIntegration, "materialize");
  const host = (hostIntegration as DeploymentHostIntegration).materialize({
    plan,
    stackName: options.stackName,
  });
  const infrastructure = new Map<string, DeploymentInfrastructureMaterialization>();
  for (const operation of plan.infrastructureOperations) {
    const integration = required(integrations, operation.integration, "infrastructure");
    assertFunction(integration, "materialize");
    infrastructure.set(
      operation.bindingId,
      (integration as DeploymentInfrastructureIntegration).materialize({
        plan,
        stackName: options.stackName,
        operation,
        host,
      }),
    );
  }
  const bindings = bindingValues(plan, infrastructure);
  const accessResources = plan.accessOperations.flatMap((operation) => {
    const integration = required(integrations, operation.integration, "access");
    const materialized = infrastructure.get(operation.bindingId);
    if (materialized === undefined)
      throw new TypeError(`Access operation "${operation.id}" has no infrastructure output.`);
    assertFunction(integration, "materialize");
    return (integration as DeploymentAccessIntegration).materialize({
      plan,
      stackName: options.stackName,
      operation,
      host,
      infrastructure: materialized,
    }).resources;
  });
  return Object.freeze({
    resources: Object.freeze([
      ...host.resources,
      ...[...infrastructure.values()].flatMap((entry) => entry.resources),
      ...accessResources,
    ]),
    bindings: Object.freeze(bindings),
    outputs: Object.freeze(host.outputs),
  });
}

function bindingValues(
  plan: DeploymentPlan,
  infrastructure: ReadonlyMap<string, DeploymentInfrastructureMaterialization>,
): Record<string, Readonly<Record<string, DeploymentInput>>> {
  const result: Record<string, Readonly<Record<string, DeploymentInput>>> = {};
  for (const binding of [...plan.connectedBindings, ...plan.infrastructureOperations]) {
    const authoritative = infrastructure.get(binding.bindingId)?.connection ?? {};
    const connection = record(binding.adapter.connection);
    const contracts = record(binding.adapter.connectionContract);
    const values: Record<string, DeploymentInput> = {};
    for (const [field, contractValue] of Object.entries(contracts)) {
      const contract = record(contractValue);
      const named = binding.namedValues.find((entry) => entry.field === field);
      const hasAuthored = own(connection, field) || named !== undefined;
      if (own(authoritative, field) && hasAuthored && contract.authoredValue !== "fallback")
        throw new TypeError(
          `Binding "${binding.bindingId}" field "${field}" conflicts with infrastructure output.`,
        );
      const value = own(authoritative, field)
        ? authoritative[field]
        : own(connection, field)
          ? (connection[field] as DeploymentInput)
          : named === undefined
            ? contract.default
            : deploymentConfiguration(named.name, { sensitive: named.sensitive });
      if (value !== undefined) values[field] = value as DeploymentInput;
      else if (contract.required === true)
        throw new TypeError(`Binding "${binding.bindingId}" field "${field}" is unresolved.`);
    }
    for (const field of Object.keys(authoritative))
      if (!own(contracts, field))
        throw new TypeError(
          `Binding "${binding.bindingId}" has undeclared infrastructure output "${field}".`,
        );
    result[binding.bindingId] = Object.freeze(values);
  }
  return result;
}

function integrationMap(values: readonly unknown[]): Map<string, DeploymentIntegrationMetadata> {
  const result = new Map<string, DeploymentIntegrationMetadata>();
  for (const value of values) {
    if (!metadata(value)) throw new TypeError("Deployment integration metadata is invalid.");
    const key = integrationKey(value.role, value.integrationId);
    if (result.has(key)) throw new TypeError(`Duplicate deployment integration ${key}.`);
    result.set(key, value);
  }
  return result;
}

function required(
  integrations: ReadonlyMap<string, DeploymentIntegrationMetadata>,
  reference: DeploymentIntegrationPlan,
  role: DeploymentIntegrationRole,
): DeploymentIntegrationMetadata {
  const value = integrations.get(integrationKey(role, reference.integrationId));
  if (value === undefined || value.protocolVersion !== reference.protocolVersion)
    throw new TypeError(`Deployment integration ${role} "${reference.integrationId}" is missing.`);
  return value;
}

function metadata(value: unknown): value is DeploymentIntegrationMetadata {
  return (
    record(value).kind === "deployment-integration" &&
    record(value).protocolVersion === 1 &&
    typeof record(value).integrationId === "string" &&
    typeof record(value).role === "string"
  );
}

function assertFunction(value: object, name: string): void {
  if (typeof (value as Record<string, unknown>)[name] !== "function")
    throw new TypeError(`Deployment integration has no ${name} implementation.`);
}

function integrationKey(role: DeploymentIntegrationRole, id: string): string {
  return `${role}\0${id}`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function own(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
