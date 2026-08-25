import type { ProviderValue } from "./providers.js";
import { normalizeId } from "@zsys/contracts";

/** Serializable settings for one named AI SDK provider recipe. */
export interface ModelProviderOptions {
  readonly defaultModel?: string;
  readonly [key: string]: ProviderValue;
}

/**
 * Value-free per-environment AI SDK provider configuration. Both defaults are
 * required; credentials should be environment references and are resolved only
 * when a runtime provider registry is constructed.
 */
export interface ModelProviders {
  readonly defaultProvider: string;
  readonly defaultModel: string;
  readonly [provider: string]: string | ModelProviderOptions;
}

export function assertModelProviders(value: unknown): asserts value is ModelProviders {
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("modelProviders must be a plain object");
  }
  const provider = ownText(value, "defaultProvider");
  const model = ownText(value, "defaultModel");
  if (provider === undefined) throw new TypeError("modelProviders.defaultProvider is required");
  if (model === undefined) throw new TypeError("modelProviders.defaultModel is required");
  const names = Object.getOwnPropertyNames(value).filter(
    (name) => name !== "defaultProvider" && name !== "defaultModel",
  );
  if (names.length === 0) {
    throw new TypeError("modelProviders must declare at least one provider");
  }
  if (!names.includes(provider)) {
    throw new TypeError(`modelProviders.defaultProvider "${provider}" is not configured`);
  }
  for (const name of names) {
    try {
      normalizeId(name);
    } catch {
      throw new TypeError(`modelProviders provider name "${name}" must be a stable ID`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !("value" in descriptor) || !isPlainRecord(descriptor.value)) {
      throw new TypeError(`modelProviders.${name} must be an object`);
    }
    ownText(descriptor.value, "defaultModel", `modelProviders.${name}.defaultModel`);
  }
}

function ownText(
  value: Record<string, unknown>,
  name: string,
  path = `modelProviders.${name}`,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, name)) return undefined;
  const entry = value[name];
  if (typeof entry !== "string" || entry.trim() === "") {
    throw new TypeError(`${path} must be non-empty text`);
  }
  return entry.trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
