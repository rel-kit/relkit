import { isEnvRef, type EnvRef } from "@relkit/config";
import { deepFreeze, isJsonValue, normalizeId, type JsonPrimitive } from "@relkit/contracts";
import type { ProviderCapability, ProviderValue } from "./providers.js";

export function normalizeValue(
  value: unknown,
  path: string,
  active = new Set<object>(),
): ProviderValue {
  if (isValueFreeEnvRef(value)) return value;
  if (value instanceof URL) return value.toString();
  if (isJsonPrimitive(value)) return value;
  if (Array.isArray(value)) {
    assertArray(value, path);
    enter(value, path, active);
    try {
      return Object.freeze(
        value.map((item, index) => normalizeValue(item, `${path}[${index}]`, active)),
      );
    } finally {
      active.delete(value);
    }
  }
  if (!isPlainRecord(value)) throw new TypeError(`${path} must contain JSON-safe metadata`);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${path} cannot contain symbol keys`);
  }
  enter(value, path, active);
  const result: Record<string, ProviderValue> = {};
  try {
    for (const name of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor || !("value" in descriptor)) {
        throw new TypeError(`${path}.${name} must be data`);
      }
      result[name] = normalizeValue(descriptor.value, `${path}.${name}`, active);
    }
    return deepFreeze(result);
  } finally {
    active.delete(value);
  }
}

export function isProviderValue(
  value: unknown,
  active = new Set<object>(),
): value is ProviderValue {
  if (isValueFreeEnvRef(value) || isJsonPrimitive(value)) return true;
  if (Array.isArray(value)) {
    if (!isSafeArray(value) || active.has(value)) return false;
    active.add(value);
    try {
      return value.every((item) => isProviderValue(item, active));
    } finally {
      active.delete(value);
    }
  }
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) return false;
  if (active.has(value)) return false;
  active.add(value);
  try {
    return Object.getOwnPropertyNames(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        isProviderValue(descriptor.value, active)
      );
    });
  } finally {
    active.delete(value);
  }
}

export function isValueFreeEnvRef(value: unknown): value is EnvRef {
  if (!isEnvRef(value) || Object.getOwnPropertySymbols(value).length > 0) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.join("\0") === ["kind", "metadata", "name", "sensitive", "type"].join("\0") &&
    isJsonValue(value.metadata) &&
    (!value.sensitive ||
      value.metadata.example === undefined ||
      value.metadata.example === "[redacted]")
  );
}

export function isStringEnvRef(value: unknown): value is EnvRef<string, string> {
  return isValueFreeEnvRef(value) && value.type === "string";
}

export function isPlainRecord(value: unknown): value is Record<string, any> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

export function isStableProfile(value: string): boolean {
  try {
    normalizeId(value);
    return true;
  } catch {
    return false;
  }
}

export function isCapabilityList(
  value: unknown,
  capabilities: readonly ProviderCapability[],
): boolean {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((entry) => capabilities.includes(entry as ProviderCapability))
  );
}

export function sameCapabilities(value: unknown, expected: readonly ProviderCapability[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

export function isSensitiveKey(key: string | undefined): boolean {
  return key !== undefined && /(?:api[-_]?key|password|secret|token|credential)/i.test(key);
}

export function walk(value: ProviderValue, visit: (reference: EnvRef) => void): void {
  if (isValueFreeEnvRef(value)) return visit(value);
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (isPlainRecord(value)) {
    Object.values(value).forEach((item) => walk(item as ProviderValue, visit));
  }
}

function assertArray(value: readonly unknown[], path: string): void {
  if (!isSafeArray(value)) throw new TypeError(`${path} must be a dense JSON array`);
}

function isSafeArray(value: readonly unknown[]): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key !== "length" && !isArrayIndex(key, value.length)) return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return false;
  }
  return true;
}

function isArrayIndex(value: string, length: number): boolean {
  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === value;
}

function enter(value: object, path: string, active: Set<object>): void {
  if (active.has(value)) throw new TypeError(`${path} must not contain cycles`);
  active.add(value);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
