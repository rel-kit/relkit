export const RUNTIME_ACTIVATION_FILE = "runtime-activation.json" as const;

export interface RuntimeActivationFingerprint {
  readonly graphHash: string;
  readonly manifestHash: string;
  readonly runtimeIntegrationsPlanHash: string;
  readonly localServicesPlanHash?: string;
  readonly providerOverridesGeneration?: string;
}

export function isRuntimeActivationFingerprint(
  value: unknown,
): value is RuntimeActivationFingerprint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    text(record.graphHash) &&
    text(record.manifestHash) &&
    text(record.runtimeIntegrationsPlanHash) &&
    (record.localServicesPlanHash === undefined || text(record.localServicesPlanHash)) &&
    (record.providerOverridesGeneration === undefined || text(record.providerOverridesGeneration))
  );
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
