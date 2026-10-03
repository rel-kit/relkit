import type { ProviderRegistryErrorCode } from "./provider-registry-types.js";

/** Stable model-provider readiness diagnostics. */
export type ModelReadinessCode = Extract<ProviderRegistryErrorCode, `RELKIT_MODEL_${string}`>;
