import { deepFreeze, isStableId, serializeJson } from "@relkit/contracts";
import type { LocalProjectIdentity } from "./identity.js";
import { readLocalStateText, writeLocalStateText } from "./state-paths.js";

export const LOCAL_SERVICE_SECRETS_FILE = "local-secrets.json" as const;
const LOCAL_SERVICE_SECRETS_VERSION = 1 as const;

export interface LocalServiceSecretBinding {
  readonly bindingId: string;
  readonly recipe: Readonly<{
    readonly integrationId: string;
    readonly recipeId: string;
    readonly recipeVersion: number;
  }>;
  readonly values: Readonly<Record<string, string>>;
}

export interface LocalServiceSecretState {
  readonly version: typeof LOCAL_SERVICE_SECRETS_VERSION;
  readonly applicationId: string;
  readonly localProjectId: string;
  readonly bindings: readonly LocalServiceSecretBinding[];
}

export function readLocalServiceSecrets(
  identity: LocalProjectIdentity,
): LocalServiceSecretState | undefined {
  const source = readLocalStateText(identity, LOCAL_SERVICE_SECRETS_FILE);
  if (source === undefined) return undefined;
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
    if (
      value.version !== LOCAL_SERVICE_SECRETS_VERSION ||
      value.applicationId !== identity.applicationId ||
      value.localProjectId !== identity.localProjectId ||
      !Array.isArray(value.bindings)
    )
      invalid();
    return deepFreeze({
      version: value.version,
      applicationId: value.applicationId,
      localProjectId: value.localProjectId,
      bindings: normalizeBindings(value.bindings),
    }) as unknown as LocalServiceSecretState;
  } catch {
    return invalid();
  }
}

export function upsertLocalServiceSecrets(
  identity: LocalProjectIdentity,
  current: LocalServiceSecretState | undefined,
  bindingId: string,
  recipe: LocalServiceSecretBinding["recipe"],
  values: Readonly<Record<string, string>>,
): LocalServiceSecretState {
  const next = deepFreeze({
    version: LOCAL_SERVICE_SECRETS_VERSION,
    applicationId: identity.applicationId,
    localProjectId: identity.localProjectId,
    bindings: normalizeBindings([
      ...(current?.bindings ?? []).filter((binding) => binding.bindingId !== bindingId),
      { bindingId, recipe, values },
    ]),
  }) as unknown as LocalServiceSecretState;
  writeLocalStateText(identity, LOCAL_SERVICE_SECRETS_FILE, `${serializeJson(next)}\n`);
  return next;
}

function normalizeBindings(value: readonly unknown[]): LocalServiceSecretBinding[] {
  const bindings = value.map((candidate) => {
    if (
      !record(candidate) ||
      !isStableId(candidate.bindingId) ||
      !record(candidate.recipe) ||
      !record(candidate.values)
    )
      invalid();
    const recipe = candidate.recipe;
    if (
      !isStableId(recipe.integrationId) ||
      !isStableId(recipe.recipeId) ||
      !positive(recipe.recipeVersion)
    )
      invalid();
    const values: Record<string, string> = {};
    for (const [name, secret] of Object.entries(candidate.values)) {
      if (
        !isStableId(name) ||
        typeof secret !== "string" ||
        secret === "" ||
        /[\0\r\n]/.test(secret)
      )
        invalid();
      values[name] = secret;
    }
    return {
      bindingId: candidate.bindingId,
      recipe: Object.freeze({
        integrationId: recipe.integrationId,
        recipeId: recipe.recipeId,
        recipeVersion: recipe.recipeVersion,
      }),
      values: Object.freeze(values),
    } satisfies LocalServiceSecretBinding;
  });
  bindings.sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  if (new Set(bindings.map((binding) => binding.bindingId)).size !== bindings.length) invalid();
  return bindings;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function invalid(): never {
  throw new Error("Local service secrets are invalid.");
}
