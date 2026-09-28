/** Stable error codes for model selector and provider configuration failures. */
export type ModelSelectionErrorCode =
  | "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID"
  | "RELKIT_MODEL_SELECTOR_INVALID"
  | "RELKIT_MODEL_PROVIDER_UNKNOWN"
  | "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING";

/** Normalized provider defaults used to resolve a model selector. */
export interface ModelProviderConfiguration {
  readonly defaultProvider: string;
  readonly defaultModel: string;
  readonly providers: Readonly<Record<string, { readonly defaultModel?: string }>>;
}

/** Selected provider, model, and combined stable identifier. */
export interface ResolvedModelSelection {
  readonly provider: string;
  readonly model: string;
  readonly id: string;
}
