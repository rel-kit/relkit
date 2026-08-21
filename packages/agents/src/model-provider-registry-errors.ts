import type { ModelSelectionErrorCode } from "./model-selection.js";

export type ModelProviderRegistryErrorCode =
  | "ZSYS_MODEL_PROVIDER_CONFIGURATION_INVALID"
  | "ZSYS_MODEL_PROVIDER_UNSUPPORTED"
  | "ZSYS_MODEL_PROVIDER_ENVIRONMENT_INVALID"
  | "ZSYS_MODEL_PROVIDER_MODEL_UNAVAILABLE"
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
