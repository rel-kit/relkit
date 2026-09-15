import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isStableId } from "@relkit/contracts";

export const LOCAL_RESOURCE_LABEL = Object.freeze({
  managed: "dev.relkit.managed",
  applicationId: "dev.relkit.application-id",
  localProjectId: "dev.relkit.local-project-id",
  bindingId: "dev.relkit.binding-id",
  environment: "dev.relkit.environment",
  serviceGeneration: "dev.relkit.service-generation",
  unitId: "dev.relkit.unit-id",
  unitKind: "dev.relkit.unit-kind",
  recipeId: "dev.relkit.recipe-id",
  planHash: "dev.relkit.plan-hash",
  endpointHash: "dev.relkit.endpoint-hash",
} as const);

export interface LocalProjectIdentity {
  readonly applicationId: string;
  readonly projectRoot: string;
  readonly localProjectId: string;
}

interface LocalResourceIdentity {
  readonly bindingId: string;
  readonly environment?: string;
  readonly serviceGeneration?: string;
  readonly recipe: {
    readonly integrationId: string;
    readonly recipeId: string;
    readonly recipeVersion: number;
  };
  readonly planHash: string;
  readonly endpointHash?: string;
}

export function createLocalProjectIdentity(
  requestedRoot: string,
  applicationId: string,
): LocalProjectIdentity {
  if (!isStableId(applicationId)) invalid();
  let projectRoot: string;
  try {
    projectRoot = realpathSync.native(requestedRoot);
    if (!statSync(projectRoot).isDirectory()) invalid();
  } catch {
    return invalid();
  }
  const digest = createHash("sha256")
    .update(projectRoot)
    .update("\0")
    .update(applicationId)
    .digest("hex");
  return Object.freeze({ applicationId, projectRoot, localProjectId: `sha256:${digest}` });
}

export function localProjectLabels(
  identity: LocalProjectIdentity,
): Readonly<Record<string, string>> {
  assertIdentity(identity);
  return Object.freeze({
    [LOCAL_RESOURCE_LABEL.managed]: "true",
    [LOCAL_RESOURCE_LABEL.applicationId]: identity.applicationId,
    [LOCAL_RESOURCE_LABEL.localProjectId]: identity.localProjectId,
  });
}

export function localResourceLabels(
  identity: LocalProjectIdentity,
  resource: LocalResourceIdentity,
): Readonly<Record<string, string>> {
  if (
    !isStableId(resource.bindingId) ||
    !isStableId(resource.recipe.integrationId) ||
    !isStableId(resource.recipe.recipeId) ||
    !Number.isSafeInteger(resource.recipe.recipeVersion) ||
    resource.recipe.recipeVersion < 1 ||
    !hash(resource.planHash)
    || (resource.endpointHash !== undefined && !hash(resource.endpointHash))
  ) {
    invalid();
  }
  return Object.freeze({
    ...localProjectLabels(identity),
    [LOCAL_RESOURCE_LABEL.bindingId]: resource.bindingId,
    ...(resource.environment === undefined ? {} : { [LOCAL_RESOURCE_LABEL.environment]: resource.environment }),
    ...(resource.serviceGeneration === undefined ? {} : { [LOCAL_RESOURCE_LABEL.serviceGeneration]: resource.serviceGeneration }),
    [LOCAL_RESOURCE_LABEL.recipeId]: [
      resource.recipe.integrationId,
      resource.recipe.recipeId,
      resource.recipe.recipeVersion,
    ].join(":"),
    [LOCAL_RESOURCE_LABEL.planHash]: resource.planHash,
    ...(resource.endpointHash === undefined ? {} : { [LOCAL_RESOURCE_LABEL.endpointHash]: resource.endpointHash }),
  });
}

export function localEndpointHash(
  endpoints: Readonly<Record<string, string>> | undefined,
): string | undefined {
  if (endpoints === undefined) return undefined;
  const value = Object.entries(endpoints).sort(([left], [right]) => left.localeCompare(right));
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function localResourceName(
  identity: LocalProjectIdentity,
  bindingId: string,
  suffix = "service",
): string {
  assertIdentity(identity);
  if (!isStableId(bindingId) || !isStableId(suffix)) invalid();
  const bindingHash = createHash("sha256").update(bindingId).digest("hex").slice(0, 12);
  const projectHash = identity.localProjectId.slice("sha256:".length).slice(0, 12);
  return `relkit-${projectHash}-${bindingHash}-${suffix}`;
}

function assertIdentity(value: LocalProjectIdentity): void {
  if (!isStableId(value.applicationId) || !hash(value.localProjectId)) invalid();
  const expected = createLocalProjectIdentity(value.projectRoot, value.applicationId);
  if (
    value.projectRoot !== expected.projectRoot ||
    value.localProjectId !== expected.localProjectId
  ) {
    invalid();
  }
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function invalid(): never {
  throw new TypeError("Local project identity is invalid");
}
