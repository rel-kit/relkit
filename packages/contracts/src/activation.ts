import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import type { RuntimeActivationFingerprint } from "./activation.types.js";

export type { RuntimeActivationFingerprint } from "./activation.types.js";

export const RUNTIME_ACTIVATION_FILE = "runtime-activation.json" as const;

/**
 * Checks that a runtime fingerprint contains all required nonempty hashes.
 * @param value - Candidate artifact fingerprint.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isRuntimeActivationFingerprintEffect(value));
 */
export function isRuntimeActivationFingerprintEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract(
    "activation.validate",
    Effect.sync(() => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
      const record = value as Record<string, unknown>;
      return (
        text(record.graphHash) &&
        text(record.manifestHash) &&
        (record.jobsManifestHash === undefined || text(record.jobsManifestHash)) &&
        text(record.runtimeIntegrationsPlanHash) &&
        (record.localServicesPlanHash === undefined || text(record.localServicesPlanHash)) &&
        (record.providerOverridesGeneration === undefined ||
          text(record.providerOverridesGeneration))
      );
    }),
  );
}

/**
 * Synchronous compatibility predicate for runtime artifact fingerprints.
 * @param value - Candidate artifact fingerprint.
 * @returns Whether all required hashes are nonempty; narrows the input type.
 * @example if (isRuntimeActivationFingerprint(value)) activate(value);
 */
export function isRuntimeActivationFingerprint(
  value: unknown,
): value is RuntimeActivationFingerprint {
  return runContract(isRuntimeActivationFingerprintEffect(value));
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
