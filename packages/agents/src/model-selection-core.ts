import { normalizeId } from "@relkit/contracts";
import { ModelSelectionError } from "./model-selection-error.js";
import type {
  ModelProviderConfiguration,
  ResolvedModelSelection,
} from "./model-selection.types.js";

/** Canonicalizes a selector after validating its syntax.
 * @param value - Unknown selector input.
 * @returns A normalized selector or undefined.
 * @throws ModelSelectionError for malformed selectors.
 * @example normalizeModelSelectorValue("openai:gpt");
 */
export function normalizeModelSelectorValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalidSelector("Model selector must be serializable text");
  const selector = value.trim();
  if (selector === "") invalidSelector("Model selector must be non-empty text");
  const separator = selector.indexOf(":");
  if (separator < 0) return providerId(selector);
  if (separator === 0 || separator !== selector.lastIndexOf(":")) {
    invalidSelector("Model selector must be a provider ID or provider:model ID");
  }
  const provider = providerId(selector.slice(0, separator));
  const model = selector.slice(separator + 1).trim();
  if (model === "") invalidSelector("Model selector model ID must be non-empty");
  return `${provider}:${model}`;
}

/** Validates and freezes provider defaults.
 * @param value - Unknown provider configuration.
 * @returns Canonical provider configuration.
 * @throws ModelSelectionError for missing or malformed settings.
 * @example parseModelProviderConfigurationValue(config);
 */
export function parseModelProviderConfigurationValue(value: unknown): ModelProviderConfiguration {
  if (!isRecord(value)) invalidConfiguration("modelProviders must be an object");
  const defaultProvider = text(value.defaultProvider, "modelProviders.defaultProvider");
  const defaultModel = text(value.defaultModel, "modelProviders.defaultModel");
  const names = Object.keys(value).filter(
    (name) => name !== "defaultProvider" && name !== "defaultModel",
  );
  if (names.length === 0) invalidConfiguration("modelProviders must declare a provider");
  const providers: Record<string, { readonly defaultModel?: string }> = {};
  for (const name of names) {
    const provider = configurationProviderId(name);
    const entry = value[name];
    if (!isRecord(entry)) invalidConfiguration(`modelProviders.${name} must be an object`);
    const entryDefault =
      entry.defaultModel === undefined
        ? undefined
        : text(entry.defaultModel, `modelProviders.${name}.defaultModel`);
    providers[provider] = Object.freeze(
      entryDefault === undefined ? {} : { defaultModel: entryDefault },
    );
  }
  const normalizedDefaultProvider = configurationProviderId(defaultProvider);
  if (providers[normalizedDefaultProvider] === undefined) {
    invalidConfiguration(
      `modelProviders.defaultProvider "${normalizedDefaultProvider}" is not configured`,
    );
  }
  return Object.freeze({
    defaultProvider: normalizedDefaultProvider,
    defaultModel,
    providers: Object.freeze(providers),
  });
}

/** Selects a provider and model from validated configuration.
 * @param selector - Optional selector.
 * @param configuration - Validated provider defaults.
 * @returns Provider, model, and combined ID.
 * @throws ModelSelectionError when a provider or model is unavailable.
 * @example resolveModelSelectorValue("openai", config);
 */
export function resolveModelSelectorValue(
  selector: unknown,
  configuration: ModelProviderConfiguration,
): ResolvedModelSelection {
  const normalized = normalizeModelSelectorValue(selector);
  const selected = normalized ?? `${configuration.defaultProvider}:${configuration.defaultModel}`;
  const separator = selected.indexOf(":");
  const provider = separator < 0 ? selected : selected.slice(0, separator);
  const configured = configuration.providers[provider];
  if (configured === undefined) {
    throw new ModelSelectionError(
      "RELKIT_MODEL_PROVIDER_UNKNOWN",
      `Model provider "${provider}" is not configured.`,
    );
  }
  const model = separator < 0 ? configured.defaultModel : selected.slice(separator + 1).trim();
  if (model === undefined || model === "") {
    throw new ModelSelectionError(
      "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING",
      `Model provider "${provider}" has no default model.`,
    );
  }
  return Object.freeze({ provider, model, id: `${provider}:${model}` });
}

function providerId(value: unknown): string {
  try {
    return normalizeId(value);
  } catch {
    invalidSelector("Model provider must be a stable ID");
  }
}

function configurationProviderId(value: unknown): string {
  try {
    return normalizeId(value);
  } catch {
    invalidConfiguration("modelProviders provider names must be stable IDs");
  }
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    invalidConfiguration(`${path} must be non-empty text`);
  }
  return value.trim();
}

function invalidSelector(message: string): never {
  throw new ModelSelectionError("RELKIT_MODEL_SELECTOR_INVALID", message);
}

function invalidConfiguration(message: string): never {
  throw new ModelSelectionError("RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
