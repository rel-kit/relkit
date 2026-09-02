import { normalizeModelSelector } from "@relkit/agents";

export interface AiSdkModelProviderOptions {
  readonly profile: string;
  readonly connection: Readonly<{
    apiKey: string;
    baseURL?: string;
    organization?: string;
    project?: string;
  }>;
  readonly behavior: Readonly<{
    provider: "openai" | "anthropic";
    defaultModel: string;
  }>;
}

export interface AiSdkModelProvider {
  readonly languageModel: (modelId: string) => unknown;
  readonly resolveModel: (selector?: string) => Readonly<{ id: string; model: unknown }>;
}

export class AiSdkModelProviderError extends Error {
  readonly name = "AiSdkModelProviderError";
  readonly code = "RELKIT_AI_SDK_MODEL_INVALID" as const;
}

export async function createAiSdkModelProvider(
  options: AiSdkModelProviderOptions,
): Promise<AiSdkModelProvider> {
  const profile = selectedProfile(options.profile);
  const defaultModel = required(options.behavior.defaultModel, "defaultModel");
  const settings = providerSettings(options);
  const provider =
    options.behavior.provider === "openai"
      ? (await import("@ai-sdk/openai")).createOpenAI(settings)
      : (await import("@ai-sdk/anthropic")).createAnthropic(settings);
  const languageModel = (modelId: string): unknown =>
    provider.languageModel(required(modelId, "model"));
  return Object.freeze({
    languageModel,
    resolveModel: (selector?: string) => {
      const model = resolveModel(selector, profile, defaultModel);
      try {
        return Object.freeze({ id: `${profile}:${model}`, model: languageModel(model) });
      } catch {
        throw invalid(`Configured model "${profile}:${model}" is unavailable`);
      }
    },
  });
}

function providerSettings(options: AiSdkModelProviderOptions): Record<string, string> {
  const { connection, behavior } = options;
  const settings: Record<string, string> = { apiKey: required(connection.apiKey, "apiKey") };
  for (const name of ["baseURL", "organization", "project"] as const) {
    const value = connection[name];
    if (value !== undefined) settings[name] = required(value, name);
  }
  if (behavior.provider !== "openai" && behavior.provider !== "anthropic")
    throw invalid("Provider must be openai or anthropic");
  if (behavior.provider === "anthropic") {
    delete settings.organization;
    delete settings.project;
  }
  return settings;
}

function resolveModel(selector: string | undefined, profile: string, fallback: string): string {
  const normalized = normalizeModelSelector(selector);
  if (normalized === undefined) return fallback;
  const separator = normalized.indexOf(":");
  const selected = separator < 0 ? normalized : normalized.slice(0, separator);
  if (selected !== profile) throw invalid(`Model profile "${selected}" is not active`);
  return separator < 0 ? fallback : required(normalized.slice(separator + 1), "model");
}

function selectedProfile(value: string): string {
  const normalized = normalizeModelSelector(value);
  if (normalized === undefined || normalized.includes(":")) throw invalid("Profile is invalid");
  return normalized;
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw invalid(`${name} is invalid`);
  return value.trim();
}

function invalid(message: string): AiSdkModelProviderError {
  return new AiSdkModelProviderError(message);
}
