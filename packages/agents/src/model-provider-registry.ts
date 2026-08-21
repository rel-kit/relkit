import {
  ModelSelectionError,
  parseModelProviderConfiguration,
  resolveModelSelector,
  type ModelProviderConfiguration,
  type ResolvedModelSelection,
} from "./model-selection.js";
import { isRecord, resolveValue } from "./model-provider-values.js";
import {
  ModelProviderRegistryError,
  type ModelProviderRegistryErrorCode,
} from "./model-provider-registry-errors.js";

export { ModelProviderRegistryError } from "./model-provider-registry-errors.js";
export type { ModelProviderRegistryErrorCode } from "./model-provider-registry-errors.js";

type AiProvider =
  | ReturnType<typeof import("@ai-sdk/anthropic").createAnthropic>
  | ReturnType<typeof import("@ai-sdk/openai").createOpenAI>;

export interface ModelProviderRegistryOptions {
  readonly configuration: unknown;
  /** Resolved environment values. The constructor never reads process.env. */
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface ActiveModelProviderRegistry {
  readonly languageModel: (modelId: string) => unknown;
  readonly resolveModel: (
    selector?: string,
  ) => Omit<ResolvedModelSelection, "model"> & { readonly model: unknown };
}

/** Creates live AI SDK providers from already-resolved runtime configuration. */
export async function createModelProviderRegistry(
  options: ModelProviderRegistryOptions,
): Promise<ActiveModelProviderRegistry | undefined> {
  if (options.configuration === undefined) return undefined;
  const configuration = record(options.configuration, "modelProviders");
  const modelConfiguration = parseConfiguration(configuration);
  const settings = Object.keys(modelConfiguration.providers)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const entry = record(configuration[name], `modelProviders.${name}`);
      if (name !== "openai" && name !== "anthropic") {
        throw new ModelProviderRegistryError(
          "ZSYS_MODEL_PROVIDER_UNSUPPORTED",
          `Model provider "${name}" is unsupported.`,
        );
      }
      return [name, providerSettings(name, entry, options.values)] as const;
    });
  const [{ createAnthropic }, { createOpenAI }, { createProviderRegistry }] = await Promise.all([
    import("@ai-sdk/anthropic"),
    import("@ai-sdk/openai"),
    import("ai"),
  ]);
  const providers: Record<string, AiProvider> = {};
  for (const [name, providerSettings] of settings) {
    if (name === "openai") providers[name] = createOpenAI(providerSettings);
    else providers[name] = createAnthropic(providerSettings);
  }
  const sdkRegistry = createProviderRegistry(providers);
  const languageModel = (modelId: string): unknown =>
    (sdkRegistry.languageModel as (id: string) => unknown)(modelId);
  const resolveModel = (selector?: string) => {
    const selection = resolveConfigurationSelection(selector, modelConfiguration);
    try {
      return Object.freeze({
        provider: selection.provider,
        id: selection.id,
        model: languageModel(selection.id),
      });
    } catch {
      throw new ModelProviderRegistryError(
        "ZSYS_MODEL_PROVIDER_MODEL_UNAVAILABLE",
        `Configured model "${selection.id}" is unavailable.`,
      );
    }
  };
  return Object.freeze({ languageModel, resolveModel });
}

function providerSettings(
  name: string,
  value: Record<string, unknown>,
  values: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const allowed =
    name === "anthropic"
      ? new Set(["apiKey", "authToken", "baseURL", "headers"])
      : new Set(["apiKey", "baseURL", "organization", "project", "headers"]);
  const settings: Record<string, unknown> = {};
  for (const [key, configured] of Object.entries(value)) {
    if (key === "defaultModel") continue;
    if (!allowed.has(key)) invalid(`modelProviders.${name}.${key} is not supported`);
    settings[key] = resolveValue(configured, values, `modelProviders.${name}.${key}`);
  }
  assertTextSettings(name, settings);
  if (settings.apiKey === undefined && settings.authToken === undefined) {
    invalid(`modelProviders.${name} requires an environment-backed credential`);
  }
  return settings;
}

function assertTextSettings(name: string, settings: Record<string, unknown>): void {
  for (const key of ["apiKey", "authToken", "baseURL", "organization", "project"]) {
    const value = settings[key];
    if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
      invalid(`modelProviders.${name}.${key} must resolve to non-empty text`);
    }
  }
  const headers = settings.headers;
  if (headers !== undefined) {
    if (!isRecord(headers) || Object.values(headers).some((value) => typeof value !== "string"))
      invalid(`modelProviders.${name}.headers must resolve to text values`);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(`${path} must be an object`);
  return value;
}

function invalid(message: string): never {
  throw new ModelProviderRegistryError("ZSYS_MODEL_PROVIDER_CONFIGURATION_INVALID", message);
}

function parseConfiguration(value: Record<string, unknown>): ModelProviderConfiguration {
  try {
    return parseModelProviderConfiguration(value);
  } catch (cause) {
    if (cause instanceof ModelSelectionError) {
      throw new ModelProviderRegistryError(cause.code, cause.message);
    }
    throw cause;
  }
}

function resolveConfigurationSelection(
  selector: string | undefined,
  configuration: ModelProviderConfiguration,
): ResolvedModelSelection {
  try {
    return resolveModelSelector(selector, configuration);
  } catch (cause) {
    if (cause instanceof ModelSelectionError) {
      throw new ModelProviderRegistryError(cause.code, cause.message);
    }
    throw cause;
  }
}
