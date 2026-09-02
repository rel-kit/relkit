import { pathToFileURL } from "node:url";
import { resolveIntegrationPackageRole } from "@relkit/compiler";
import {
  DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  type DeploymentIntegrationMetadata,
  type DeploymentIntegrationPlan,
  type DeploymentIntegrationRole,
  type DeploymentPlan,
} from "@relkit/deploy";

export interface LoadedDeploymentIntegration {
  readonly metadata: DeploymentIntegrationMetadata;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
  readonly resolvedPath: string;
  readonly module: Readonly<Record<string, unknown>>;
}

export interface LoadedDeploymentIntegrations {
  readonly engine: LoadedDeploymentIntegration;
  readonly host: LoadedDeploymentIntegration;
  readonly infrastructure: ReadonlyMap<string, LoadedDeploymentIntegration>;
  readonly access: ReadonlyMap<string, LoadedDeploymentIntegration>;
}

export async function loadDeploymentIntegrations(
  projectRoot: string,
  plan: DeploymentPlan,
): Promise<LoadedDeploymentIntegrations> {
  const loaded = new Map<string, LoadedDeploymentIntegration>();
  for (const reference of references(plan)) {
    const key = integrationKey(reference.role, reference.integrationId);
    if (!loaded.has(key)) loaded.set(key, await load(projectRoot, reference));
  }
  return Object.freeze({
    engine: required(loaded, plan.engine),
    host: required(loaded, plan.host),
    infrastructure: roleMap(loaded, "infrastructure"),
    access: roleMap(loaded, "access"),
  });
}

export function deploymentIntegrationEntries(
  integrations: LoadedDeploymentIntegrations,
): readonly LoadedDeploymentIntegration[] {
  return [
    integrations.engine,
    integrations.host,
    ...integrations.infrastructure.values(),
    ...integrations.access.values(),
  ].sort((left, right) =>
    integrationKey(left.metadata.role, left.metadata.integrationId).localeCompare(
      integrationKey(right.metadata.role, right.metadata.integrationId),
    ),
  );
}

function references(plan: DeploymentPlan): readonly DeploymentIntegrationPlan[] {
  return [
    plan.engine,
    plan.host,
    ...plan.infrastructureOperations.map((entry) => entry.integration),
    ...plan.accessOperations.map((entry) => entry.integration),
  ].sort((left, right) =>
    integrationKey(left.role, left.integrationId).localeCompare(
      integrationKey(right.role, right.integrationId),
    ),
  );
}

async function load(
  projectRoot: string,
  reference: DeploymentIntegrationPlan,
): Promise<LoadedDeploymentIntegration> {
  const packageName = `@relkit/${reference.integrationId}`;
  const selected = resolveIntegrationPackageRole({
    projectRoot,
    packageName,
    integrationId: reference.integrationId,
    role: reference.role,
  });
  const module = (await import(pathToFileURL(selected.resolvedPath).href)) as Record<
    string,
    unknown
  >;
  const metadata = module.deploymentIntegration;
  if (!matches(metadata, reference)) {
    throw new TypeError(
      `Deployment integration ${reference.role} "${reference.integrationId}" reports incompatible metadata.`,
    );
  }
  return Object.freeze({ ...selected, metadata, module });
}

function matches(
  value: unknown,
  reference: DeploymentIntegrationPlan,
): value is DeploymentIntegrationMetadata {
  return (
    isRecord(value) &&
    value.kind === "deployment-integration" &&
    value.protocolVersion === DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION &&
    value.protocolVersion === reference.protocolVersion &&
    value.integrationId === reference.integrationId &&
    value.role === reference.role
  );
}

function required(
  loaded: ReadonlyMap<string, LoadedDeploymentIntegration>,
  reference: DeploymentIntegrationPlan,
): LoadedDeploymentIntegration {
  const selected = loaded.get(integrationKey(reference.role, reference.integrationId));
  if (selected === undefined)
    throw new TypeError("Required deployment integration was not loaded.");
  return selected;
}

function roleMap(
  loaded: ReadonlyMap<string, LoadedDeploymentIntegration>,
  role: "infrastructure" | "access",
): ReadonlyMap<string, LoadedDeploymentIntegration> {
  return new Map(
    [...loaded.values()]
      .filter((entry) => entry.metadata.role === role)
      .map((entry) => [entry.metadata.integrationId, entry] as const),
  );
}

function integrationKey(role: DeploymentIntegrationRole, integrationId: string): string {
  return `${role}\0${integrationId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
