import type { ModelSelectionErrorCode } from "./model-selection.js";

export type ModelProviderRegistryErrorCode =
  | "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID"
  | "RELKIT_MODEL_PROVIDER_UNSUPPORTED"
  | "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID"
  | "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE"
  | ModelSelectionErrorCode;

export class ModelProviderRegistryError extends Error {
  readonly name = "ModelProviderRegistryError";

  constructor(
    readonly code: ModelProviderRegistryErrorCode,
    message: string,
  ) {
    super(message);
  }
}
