import { normalizeId } from "@zsys/contracts";
import type { NormalizedDescriptor } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export interface CompileModelConfiguration {
  readonly defaultProvider: string;
  readonly defaultModel: string;
  readonly providers: ReadonlyMap<string, string | undefined>;
}

export interface ModelSelectionDiagnostic {
  readonly code:
    | "ZSYS_MODEL_PROVIDER_CONFIGURATION_INVALID"
    | "ZSYS_MODEL_SELECTOR_INVALID"
    | "ZSYS_MODEL_PROVIDER_UNKNOWN"
    | "ZSYS_MODEL_PROVIDER_DEFAULT_MISSING";
  readonly message: string;
}

export function readModelConfigurations(descriptors: readonly NormalizedDescriptor[]): readonly {
  readonly configuration?: CompileModelConfiguration;
  readonly error?: ModelSelectionDiagnostic;
}[] {
  return descriptors
    .filter((descriptor) => descriptor.kind === "app")
    .flatMap((descriptor) => {
      const value = isRecord(descriptor.value) ? descriptor.value : {};
      const providers = isRecord(value.providers) ? value.providers : {};
      return Object.values(providers).flatMap((provider) => {
        const metadata = isRecord(provider) && isRecord(provider.metadata) ? provider.metadata : {};
        const configuration = isRecord(metadata.configuration)
          ? metadata.configuration.modelProviders
          : undefined;
        if (configuration === undefined) return [];
        const parsed = parseModelConfiguration(configuration);
        return [parsed];
      });
    });
}

export function resolveCompiledModel(
  selector: unknown,
  configuration: CompileModelConfiguration,
): ModelSelectionDiagnostic | undefined {
  const normalized = normalizeSelector(selector);
  if (selector !== undefined && normalized === undefined) {
    return { code: "ZSYS_MODEL_SELECTOR_INVALID", message: "Model selector is invalid." };
  }
  const selected = normalized ?? `${configuration.defaultProvider}:${configuration.defaultModel}`;
  const separator = selected.indexOf(":");
  const provider = separator < 0 ? selected : selected.slice(0, separator);
  const defaultModel = configuration.providers.get(provider);
  if (defaultModel === undefined && !configuration.providers.has(provider)) {
    return {
      code: "ZSYS_MODEL_PROVIDER_UNKNOWN",
      message: `Model provider "${provider}" is not configured.`,
    };
  }
  if (separator < 0 && defaultModel === undefined) {
    return {
      code: "ZSYS_MODEL_PROVIDER_DEFAULT_MISSING",
      message: `Model provider "${provider}" has no default model.`,
    };
  }
  return undefined;
}

function parseModelConfiguration(
  value: unknown,
):
  | { readonly configuration: CompileModelConfiguration }
  | { readonly error: ModelSelectionDiagnostic } {
  if (!isRecord(value)) return configurationError("modelProviders must be an object");
  const defaultProvider = text(value.defaultProvider);
  const defaultModel = text(value.defaultModel);
  if (defaultProvider === undefined || defaultModel === undefined) {
    return configurationError("modelProviders requires defaultProvider and defaultModel");
  }
  const providers = new Map<string, string | undefined>();
  for (const name of Object.keys(value).filter(
    (key) => key !== "defaultProvider" && key !== "defaultModel",
  )) {
    const provider = stableId(name);
    if (provider === undefined)
      return configurationError("modelProviders has an invalid provider name");
    const entry = value[name];
    if (!isRecord(entry)) return configurationError(`modelProviders.${name} must be an object`);
    const model = entry.defaultModel === undefined ? undefined : text(entry.defaultModel);
    if (entry.defaultModel !== undefined && model === undefined) {
      return configurationError(`modelProviders.${name}.defaultModel must be non-empty text`);
    }
    providers.set(provider, model);
  }
  const normalizedDefaultProvider = stableId(defaultProvider);
  if (normalizedDefaultProvider === undefined || !providers.has(normalizedDefaultProvider)) {
    return configurationError("modelProviders.defaultProvider is not configured");
  }
  return {
    configuration: {
      defaultProvider: normalizedDefaultProvider,
      defaultModel,
      providers,
    },
  };
}

export function normalizeSelector(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const selector = value.trim();
  const separator = selector.indexOf(":");
  if (separator < 0) return stableId(selector);
  if (separator === 0 || separator !== selector.lastIndexOf(":")) return undefined;
  const provider = stableId(selector.slice(0, separator));
  const model = selector.slice(separator + 1).trim();
  return provider === undefined || model === "" ? undefined : `${provider}:${model}`;
}

function configurationError(message: string): { readonly error: ModelSelectionDiagnostic } {
  return { error: { code: "ZSYS_MODEL_PROVIDER_CONFIGURATION_INVALID", message } };
}

function stableId(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch {
    return undefined;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
