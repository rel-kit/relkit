import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  isBindingValueRef,
  type BindingValueRef,
  type ProviderAdapter,
  type ProviderBehavior,
  type ProviderConnectionValues,
} from "@relkit/provider";

const model = defineProviderCapability("model");
const integration = defineIntegrationReference("ai-sdk");
const connectionContract = defineConnectionContract({
  apiKey: { sensitive: true },
  baseURL: { required: false },
  organization: { required: false },
  project: { required: false },
});
const optionKeys = new Set([
  "provider",
  "defaultModel",
  "apiKey",
  "baseURL",
  "organization",
  "project",
]);

type SecretReference = BindingValueRef<string, string, "secret-string">;
type TextReference = BindingValueRef<string, string, "string">;
type UrlReference = BindingValueRef<string, URL, "url">;

export interface AiSdkOptions {
  readonly provider: "openai" | "anthropic";
  readonly defaultModel: string;
  readonly apiKey: SecretReference;
  readonly baseURL?: string | URL | TextReference | UrlReference;
  readonly organization?: string | TextReference;
  readonly project?: string | TextReference;
}

export type AiSdkBehavior = Readonly<{
  provider: AiSdkOptions["provider"];
  defaultModel: string;
}>;

export type AiSdkAdapter = ProviderAdapter<
  typeof model,
  "ai-sdk",
  ProviderConnectionValues,
  ProviderBehavior<AiSdkBehavior>
>;

/**
 * Defines one AI SDK model profile without constructing a live model.
 *
 * @example
 * ```ts
 * import { aiSdk } from "@relkit/ai-sdk";
 * import { env } from "@relkit/app/config";
 * const model = aiSdk({ provider: "openai", defaultModel: "gpt-5-mini", apiKey: env.secret("OPENAI_API_KEY") });
 * ```
 * @category Integrations
 * @since 0.2.0
 */
export function aiSdk(options: AiSdkOptions): AiSdkAdapter {
  assertOptions(options);
  return defineProviderAdapter({
    integration,
    capability: model,
    adapterId: "ai-sdk",
    connectionContract,
    connection: {
      apiKey: options.apiKey,
      ...(options.baseURL === undefined ? {} : { baseURL: urlValue(options.baseURL) }),
      ...(options.organization === undefined ? {} : { organization: options.organization }),
      ...(options.project === undefined ? {} : { project: options.project }),
    },
    behavior: defineProviderBehavior({
      provider: options.provider,
      defaultModel: options.defaultModel.trim(),
    }),
  });
}

function assertOptions(options: AiSdkOptions): void {
  const value: unknown = options;
  if (!isRecord(value)) throw new TypeError("AI SDK options must be an object");
  for (const key of Object.keys(options))
    if (!optionKeys.has(key)) throw new TypeError(`Unknown AI SDK option "${key}"`);
  if (options.provider !== "openai" && options.provider !== "anthropic")
    throw new TypeError("AI SDK provider must be openai or anthropic");
  text(options.defaultModel, "defaultModel");
  secret(options.apiKey, "apiKey");
  endpoint(options.baseURL);
  textValue(options.organization, "organization");
  textValue(options.project, "project");
  if (options.provider === "anthropic" && (options.organization || options.project))
    throw new TypeError("AI SDK organization and project are OpenAI-only");
}

function endpoint(value: AiSdkOptions["baseURL"]): void {
  if (value === undefined) return;
  if (isBindingValueRef(value)) {
    if ((value.type !== "string" && value.type !== "url") || value.sensitive)
      throw new TypeError("AI SDK baseURL must be an HTTP URL or named text/URL binding value");
    return;
  }
  const url = value instanceof URL ? value : new URL(text(value, "baseURL"));
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new TypeError("AI SDK baseURL must use http or https");
}

function secret(value: unknown, name: string): void {
  if (!isBindingValueRef(value) || value.type !== "secret-string" || !value.sensitive)
    throw new TypeError(`AI SDK ${name} must be a named secret binding value`);
}

function textValue(value: string | TextReference | undefined, name: string): void {
  if (value === undefined) return;
  if (isBindingValueRef(value)) {
    if (value.type !== "string" || value.sensitive)
      throw new TypeError(`AI SDK ${name} must be text or a named text binding value`);
    return;
  }
  text(value, name);
}

function urlValue(value: NonNullable<AiSdkOptions["baseURL"]>) {
  return value instanceof URL ? value.toString() : value;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`AI SDK ${name} must be non-empty text`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
