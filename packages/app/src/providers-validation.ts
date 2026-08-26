import { isEnvRef } from "@zsys/config";
import { deepFreeze, normalizeId } from "@zsys/contracts";
import { assertModelProviders } from "./model-providers.js";
import type {
  ProviderAdapter,
  ProviderBinding,
  ProviderCapability,
  ProviderConfig,
  ProviderEnvironmentReference,
  ProviderOwnership,
  ProviderTopology,
  ProviderValue,
} from "./providers.js";
import { PROVIDER_CAPABILITIES } from "./providers.js";
import {
  isPlainRecord,
  isProviderValue,
  normalizeValue,
  walk,
} from "./providers-validation-utils.js";

export function createAdapter<C extends ProviderCapability, N extends string>(
  capability: C,
  adapter: N,
  options: object,
  secretPaths: readonly string[],
  rejectSensitiveLiterals = false,
): ProviderAdapter<C, N> {
  if (!isPlainRecord(options)) throw new TypeError(`${adapter} options must be an object`);
  if (capability === "models") assertModelProviders(options);
  assertSecretPaths(options, secretPaths, adapter);
  const configuration = normalizeValue(options, `providers.${capability}.${adapter}`);
  if (!isPlainRecord(configuration)) throw new TypeError(`${adapter} options must be an object`);
  if (rejectSensitiveLiterals) assertNoSensitiveLiterals(configuration, adapter);
  return deepFreeze({
    kind: "provider-adapter" as const,
    capability,
    adapter,
    configuration: configuration as ProviderConfig,
    environment: providerEnvironment(configuration),
  });
}

export function createBinding<C extends ProviderCapability, N extends string>(
  ownership: ProviderOwnership,
  adapter: ProviderAdapter<C, N>,
): ProviderBinding<C, N> {
  if (!isProviderAdapter(adapter)) throw new TypeError("Invalid provider adapter");
  return deepFreeze({ kind: "provider-binding" as const, ownership, adapter });
}

export function copyProviderTopology(value: unknown): ProviderTopology {
  if (!isPlainRecord(value)) throw new TypeError("App providers must be an object");
  const result: Record<string, Record<string, ProviderBinding>> = {};
  for (const [capability, profiles] of Object.entries(value)) {
    if (profiles === undefined) continue;
    if (!PROVIDER_CAPABILITIES.includes(capability as ProviderCapability)) {
      throw new TypeError(`Unknown provider capability "${capability}"`);
    }
    if (!isPlainRecord(profiles)) {
      throw new TypeError(`Provider capability "${capability}" must contain profiles`);
    }
    const bindings: Record<string, ProviderBinding> = {};
    for (const [profile, binding] of Object.entries(profiles)) {
      normalizeId(profile);
      if (!isProviderBinding(binding) || binding.adapter.capability !== capability) {
        throw new TypeError(`Invalid ${capability} provider binding "${profile}"`);
      }
      bindings[profile] = binding;
    }
    result[capability] = bindings;
  }
  return deepFreeze(result) as ProviderTopology;
}

export function isProviderTopology(value: unknown): value is ProviderTopology {
  try {
    copyProviderTopology(value);
    return true;
  } catch {
    return false;
  }
}

export function isProviderBinding(value: unknown): value is ProviderBinding {
  return (
    isPlainRecord(value) &&
    value.kind === "provider-binding" &&
    (value.ownership === "external" || value.ownership === "managed") &&
    isProviderAdapter(value.adapter)
  );
}

export function providerEnvironment(value: ProviderValue): readonly ProviderEnvironmentReference[] {
  const refs = new Map<string, ProviderEnvironmentReference>();
  walk(value, (reference) => {
    refs.set(reference.name, {
      name: reference.name,
      type: reference.type,
      sensitive: reference.sensitive,
    });
  });
  return Object.freeze([...refs.values()].sort((a, b) => a.name.localeCompare(b.name)));
}

function isProviderAdapter(value: unknown): value is ProviderAdapter {
  return (
    isPlainRecord(value) &&
    value.kind === "provider-adapter" &&
    PROVIDER_CAPABILITIES.includes(value.capability as ProviderCapability) &&
    typeof value.adapter === "string" &&
    value.adapter.length > 0 &&
    isPlainRecord(value.configuration) &&
    isProviderValue(value.configuration) &&
    Array.isArray(value.environment)
  );
}

function assertSecretPaths(value: object, paths: readonly string[], adapter: string): void {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (candidate !== undefined && (!isEnvRef(candidate) || !candidate.sensitive)) {
      throw new TypeError(`${adapter}.${path} must be a secret environment reference`);
    }
  }
}

function assertNoSensitiveLiterals(value: ProviderValue, path: string): void {
  if (!isPlainRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const current = `${path}.${key}`;
    if (/(?:api[-_]?key|password|secret|token|credential|headers?)/i.test(key)) {
      if (isEnvRef(item)) {
        if (!item.sensitive)
          throw new TypeError(`${current} must use a secret environment reference`);
      } else if (isPlainRecord(item)) {
        assertNoSensitiveLiterals(item, current);
      } else {
        throw new TypeError(`${current} must use a secret environment reference`);
      }
    } else if (isPlainRecord(item)) {
      assertNoSensitiveLiterals(item, current);
    }
  }
}

function readPath(value: object, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!isPlainRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}
