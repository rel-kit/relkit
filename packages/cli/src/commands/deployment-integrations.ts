import { pathToFileURL } from "node:url";
import { Effect, Layer, Schema } from "effect";
import type {
  DeploymentIntegrationMetadata,
  DeploymentIntegrationPlan,
  DeploymentIntegrationRole,
  DeploymentPlan,
} from "@relkit/deploy";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";
import { CliModules, moduleLayer } from "../services/modules.service.js";
import { deploymentIntegrationMetadataSchema } from "./deployment-integrations.schemas.js";
import type {
  LoadedDeploymentIntegration,
  LoadedDeploymentIntegrations,
} from "./deployment-integrations.types.js";
export type {
  LoadedDeploymentIntegration,
  LoadedDeploymentIntegrations,
} from "./deployment-integrations.types.js";

/**
 * Resolves only declared deployment roles, retaining module namespace identity.
 * @param projectRoot - Package resolution root.
 * @param plan - Validated provider-neutral deployment plan.
 * @returns Complete role registrations, requiring explicit compiler and import authority.
 */
export const loadDeploymentIntegrationsEffect = Effect.fn("Deployment.loadIntegrations")(
  function* (projectRoot: string, plan: DeploymentPlan) {
    const selected = [
      ...new Map(
        references(plan).map((entry) => [integrationKey(entry.role, entry.integrationId), entry]),
      ).values(),
    ];
    const entries = yield* Effect.forEach(selected, (reference) =>
      loadIntegrationEffect(projectRoot, reference),
    );
    const loaded = new Map(
      entries.map((entry) => [
        integrationKey(entry.metadata.role, entry.metadata.integrationId),
        entry,
      ]),
    );
    return yield* cliTry("deployment.integrations", () =>
      Object.freeze({
        engine: required(loaded, plan.engine),
        host: required(loaded, plan.host),
        infrastructure: roleMap(loaded, "infrastructure"),
        access: roleMap(loaded, "access"),
      }),
    );
  },
  (effect, _projectRoot: string, _plan: DeploymentPlan) =>
    observeCli("deployment.loadIntegrations", effect),
);

/**
 * Adapts standalone integration discovery to one shared runtime edge.
 * @param projectRoot - Authored root used for package resolution.
 * @param plan - Selected deployment cohort.
 * @returns The accepted integrations, without a cross-invocation cache.
 */
export function loadDeploymentIntegrations(
  projectRoot: string,
  plan: DeploymentPlan,
): Promise<LoadedDeploymentIntegrations> {
  return runCliEffect(
    loadDeploymentIntegrationsEffect(projectRoot, plan),
    Layer.merge(compilerLayer, moduleLayer),
  );
}

/**
 * Returns deterministically ordered role registrations for program rendering.
 * @param integrations - Complete accepted role registrations.
 * @returns The portable sorted role entries.
 */
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

/** Collects the role references required by the accepted deployment graph.
 * @param plan - Accepted deployment cohort.
 * @returns Deterministically ordered required role references.
 */
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
/**
 * Loads one declared role through the pinned compiler's contained resolution API.
 * @param projectRoot - Package resolution root.
 * @param reference - Selected integration identity and role.
 * @returns An accepted native namespace and its validated metadata.
 */
const loadIntegrationEffect = Effect.fn("Deployment.loadIntegration")(
  function* (projectRoot: string, reference: DeploymentIntegrationPlan) {
    const compiler = yield* CliCompiler;
    const modules = yield* CliModules;
    const selected = yield* compiler.integrationRole({
      projectRoot,
      packageName: `@relkit/${reference.integrationId}`,
      integrationId: reference.integrationId,
      role: reference.role,
    });
    const module = yield* modules.load(pathToFileURL(selected.resolvedPath).href);
    const metadata = yield* cliTry("deployment.metadata", () => {
      const metadata = module.deploymentIntegration;
      if (!matches(metadata, reference))
        throw new TypeError(
          `Deployment integration ${reference.role} "${reference.integrationId}" reports incompatible metadata.`,
        );
      return metadata;
    });
    return Object.freeze({ ...selected, metadata, module });
  },
  (effect, _projectRoot: string, _reference: DeploymentIntegrationPlan) =>
    observeCli("deployment.loadIntegration", effect),
);

/** Checks namespace role metadata against the declared identity and version.
 * @param value - Untrusted namespace metadata.
 * @param reference - Expected role identity/version.
 * @returns Whether the complete metadata matches this declared role.
 */
function matches(
  value: unknown,
  reference: DeploymentIntegrationPlan,
): value is DeploymentIntegrationMetadata {
  return (
    Schema.is(deploymentIntegrationMetadataSchema)(value) &&
    value.protocolVersion === reference.protocolVersion &&
    value.integrationId === reference.integrationId &&
    value.role === reference.role
  );
}
/** Selects the unique registered integration for a required role.
 * @param loaded - Accepted role registrations.
 * @param reference - Required engine/host reference.
 * @returns Its accepted namespace or the existing missing-role failure.
 */
function required(
  loaded: ReadonlyMap<string, LoadedDeploymentIntegration>,
  reference: DeploymentIntegrationPlan,
): LoadedDeploymentIntegration {
  const selected = loaded.get(integrationKey(reference.role, reference.integrationId));
  if (selected === undefined)
    throw new TypeError("Required deployment integration was not loaded.");
  return selected;
}

/** Projects optional integration registrations into a portable role map.
 * @param loaded - Accepted role registrations.
 * @param role - Optional role family.
 * @returns Portable entries keyed by integration identity.
 */
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

/** Constructs an unambiguous session lookup key for an integration role.
 * @param role - Declared role.
 * @param integrationId - Declared integration owner.
 * @returns A collision-free in-memory role/identity key.
 */
function integrationKey(role: DeploymentIntegrationRole, integrationId: string): string {
  return `${role}\0${integrationId}`;
}
