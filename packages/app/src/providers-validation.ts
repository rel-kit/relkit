import { deepFreeze, normalizeId } from "@zsys/contracts";
import type {
  ProviderCapability,
  ProviderConfig,
  ProviderRecipe,
  ProviderSetMetadata,
  ProviderValue,
} from "./providers.js";
import { assertModelProviders } from "./model-providers.js";
import {
  isCapabilityList,
  isPlainRecord,
  isProviderValue,
  isSensitiveKey,
  isStableProfile,
  isStringEnvRef,
  isValueFreeEnvRef,
  normalizeValue,
  sameCapabilities,
  walk,
} from "./providers-validation-utils.js";

export const PROVIDER_CAPABILITIES: readonly ProviderCapability[] = Object.freeze([
  "buckets",
  "cache",
  "jobs",
  "events",
  "observability",
]);

const localKeys = new Set([
  "stateDirectory",
  "observabilityDirectory",
  "buckets",
  "cache",
  "jobs",
  "events",
  "modelProviders",
]);

export function normalizeProviderOptions(recipe: ProviderRecipe, value: unknown): ProviderConfig {
  if (!isPlainRecord(value)) throw new TypeError("Provider options must be a plain object");
  if (Object.prototype.hasOwnProperty.call(value, "modelProviders")) {
    assertModelProviders(value.modelProviders);
  }
  const allowed = allowedKeys(recipe);
  const result: Record<string, ProviderValue> = {};
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("Provider options cannot contain symbol keys");
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!allowed.has(key)) throw new TypeError(`Unknown ${recipe} provider option "${key}"`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new TypeError(`Provider option "${key}" must be a data property`);
    }
    result[key] = normalizeValue(descriptor.value, `provider.${key}`, key);
  }
  validateRecipeOptions(recipe, result);
  return deepFreeze(result);
}

export function providerProfiles(
  value: Record<string, unknown>,
): Readonly<Record<string, readonly ProviderCapability[]>> {
  const profiles = new Map<string, Set<ProviderCapability>>();
  for (const capability of PROVIDER_CAPABILITIES) {
    const configured = value[capability];
    if (!isPlainRecord(configured)) continue;
    for (const name of Object.keys(configured)) {
      const id = normalizeId(name);
      const capabilities = profiles.get(id) ?? new Set<ProviderCapability>();
      capabilities.add(capability);
      profiles.set(id, capabilities);
    }
  }
  return deepFreeze(
    Object.fromEntries(
      [...profiles.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, capabilities]) => [name, [...capabilities].sort()]),
    ),
  );
}

export function providerEnvironment(value: ProviderValue): readonly {
  name: string;
  type: string;
  sensitive: boolean;
}[] {
  const refs = new Map<string, { name: string; type: string; sensitive: boolean }>();
  walk(value, (reference) =>
    refs.set(reference.name, {
      name: reference.name,
      type: reference.type,
      sensitive: reference.sensitive,
    }),
  );
  return Object.freeze(
    [...refs.values()].sort((left, right) => left.name.localeCompare(right.name)),
  );
}

export function isProviderMetadata(
  value: unknown,
  capabilities: readonly ProviderCapability[] = PROVIDER_CAPABILITIES,
): value is ProviderSetMetadata {
  if (!isPlainRecord(value) || value.kind !== "provider-metadata") return false;
  if (!hasExactKeys(value, ["capabilities", "configuration", "environment", "kind", "profiles"])) {
    return false;
  }
  if (!sameCapabilities(value.capabilities, capabilities)) return false;
  if (!isPlainRecord(value.configuration) || !isProviderValue(value.configuration)) return false;
  for (const [name, profileCapabilities] of Object.entries(value.profiles)) {
    if (!isStableProfile(name) || !isCapabilityList(profileCapabilities, capabilities))
      return false;
  }
  if (!Array.isArray(value.environment)) return false;
  const names = new Set<string>();
  return value.environment.every(
    (entry) =>
      isPlainRecord(entry) &&
      hasExactKeys(entry, ["name", "sensitive", "type"]) &&
      typeof entry.name === "string" &&
      entry.name.length > 0 &&
      typeof entry.type === "string" &&
      typeof entry.sensitive === "boolean" &&
      !names.has(entry.name) &&
      names.add(entry.name) === names,
  );
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const keys = Object.getOwnPropertyNames(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === expected.length && keys.every((key, index) => key === sortedExpected[index])
  );
}

function allowedKeys(recipe: ProviderRecipe): Set<string> {
  if (recipe === "local") return localKeys;
  if (recipe === "test") return new Set([...localKeys, "deterministicIds", "deterministicClock"]);
  return new Set(["region", "buckets", "cache", "jobs", "events", "modelProviders"]);
}

function validateRecipeOptions(recipe: ProviderRecipe, value: ProviderConfig): void {
  if (recipe === "aws") {
    const region = value.region;
    if (!(typeof region === "string" && region.trim() !== "") && !isStringEnvRef(region)) {
      throw new TypeError("AWS providers require a non-empty string region or string EnvRef");
    }
  }
  for (const key of ["stateDirectory", "observabilityDirectory"] as const) {
    if (key in value && (typeof value[key] !== "string" || value[key].trim() === "")) {
      throw new TypeError(`Provider option "${key}" must be a non-empty string`);
    }
  }
  for (const key of ["deterministicIds", "deterministicClock"] as const) {
    if (key in value && typeof value[key] !== "boolean") {
      throw new TypeError(`Provider option "${key}" must be boolean`);
    }
  }
}
