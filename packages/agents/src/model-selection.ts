import { normalizeId } from "@relkit/contracts";

export type ModelSelectionErrorCode =
  | "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID"
  | "RELKIT_MODEL_SELECTOR_INVALID"
  | "RELKIT_MODEL_PROVIDER_UNKNOWN"
  | "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING";

export interface ModelProviderConfiguration {
  readonly defaultProvider: string;
  readonly defaultModel: string;
  readonly providers: Readonly<Record<string, { readonly defaultModel?: string }>>;
}

export interface ResolvedModelSelection {
  readonly provider: string;
  readonly model: string;
  readonly id: string;
}

export class ModelSelectionError extends TypeError {
  readonly name = "ModelSelectionError";

  constructor(
    readonly code: ModelSelectionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeModelSelector(value: unknown): string | undefined {
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

export function parseModelProviderConfiguration(value: unknown): ModelProviderConfiguration {
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

export function resolveModelSelector(
  selector: unknown,
  configuration: ModelProviderConfiguration,
): ResolvedModelSelection {
  const normalized = normalizeModelSelector(selector);
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
