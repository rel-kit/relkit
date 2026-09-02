import { deepFreeze, isStableId, serializeJson } from "@relkit/contracts";
import {
  LOCAL_SERVICE_STATE_FILE,
  LOCAL_SERVICE_STATE_VERSION,
  type LocalServiceBindingState,
  type LocalServiceState,
} from "@relkit/local-service";
import type { LocalProjectIdentity } from "./identity.js";
import { readLocalStateText, removeLocalStateFile, writeLocalStateText } from "./state-paths.js";

export function writeLocalServiceState(
  identity: LocalProjectIdentity,
  planHash: string,
  services: readonly LocalServiceBindingState[],
): LocalServiceState {
  if (!hash(planHash)) invalid();
  const state = deepFreeze({
    version: LOCAL_SERVICE_STATE_VERSION,
    applicationId: identity.applicationId,
    localProjectId: identity.localProjectId,
    planHash,
    services: normalizeServices(services),
  }) satisfies LocalServiceState;
  writeLocalStateText(identity, LOCAL_SERVICE_STATE_FILE, `${serializeJson(state)}\n`);
  return state;
}

export function readLocalServiceState(
  identity: LocalProjectIdentity,
): LocalServiceState | undefined {
  const source = readLocalStateText(identity, LOCAL_SERVICE_STATE_FILE);
  if (source === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return invalid();
  }
  if (
    !record(value) ||
    value.version !== LOCAL_SERVICE_STATE_VERSION ||
    value.applicationId !== identity.applicationId ||
    value.localProjectId !== identity.localProjectId ||
    !hash(value.planHash) ||
    !Array.isArray(value.services)
  ) {
    invalid();
  }
  return deepFreeze({
    ...value,
    services: normalizeServices(value.services as LocalServiceBindingState[]),
  }) as unknown as LocalServiceState;
}

export function removeLocalServiceState(identity: LocalProjectIdentity): void {
  removeLocalStateFile(identity, LOCAL_SERVICE_STATE_FILE);
}

function normalizeServices(
  services: readonly LocalServiceBindingState[],
): LocalServiceBindingState[] {
  const values = services.map((service) => {
    if (
      !record(service) ||
      !isStableId(service.bindingId) ||
      !record(service.recipe) ||
      !isStableId(service.recipe.integrationId) ||
      !isStableId(service.recipe.recipeId) ||
      !Number.isSafeInteger(service.recipe.recipeVersion) ||
      service.recipe.recipeVersion < 1 ||
      !["pending", "starting", "healthy", "unhealthy", "stopped"].includes(service.phase) ||
      (service.message !== undefined && typeof service.message !== "string")
    ) {
      invalid();
    }
    return deepFreeze({ ...service });
  });
  values.sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  if (new Set(values.map((value) => value.bindingId)).size !== values.length) invalid();
  return values;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function invalid(): never {
  throw new Error("Local service state is invalid.");
}
