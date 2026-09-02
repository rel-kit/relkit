import { createHash } from "node:crypto";
import type { RuntimeActivationFingerprint } from "@relkit/contracts";

export interface RuntimeActivationFingerprintInput {
  readonly graphHash: string;
  readonly manifestSource: string;
  readonly runtimeIntegrationsPlanSource: string;
  readonly localServicesPlanSource?: string;
  readonly providerOverridesGeneration?: string;
}

export function createRuntimeActivationFingerprint(
  input: RuntimeActivationFingerprintInput,
): RuntimeActivationFingerprint {
  required(input.graphHash, "graphHash");
  required(input.manifestSource, "manifestSource");
  required(input.runtimeIntegrationsPlanSource, "runtimeIntegrationsPlanSource");
  if (input.localServicesPlanSource !== undefined)
    required(input.localServicesPlanSource, "localServicesPlanSource");
  if (input.providerOverridesGeneration !== undefined)
    required(input.providerOverridesGeneration, "providerOverridesGeneration");
  return Object.freeze({
    graphHash: input.graphHash,
    manifestHash: hashGeneratedArtifact(input.manifestSource),
    runtimeIntegrationsPlanHash: hashGeneratedArtifact(input.runtimeIntegrationsPlanSource),
    ...(input.localServicesPlanSource === undefined
      ? {}
      : { localServicesPlanHash: hashGeneratedArtifact(input.localServicesPlanSource) }),
    ...(input.providerOverridesGeneration === undefined
      ? {}
      : { providerOverridesGeneration: input.providerOverridesGeneration }),
  });
}

export function hashGeneratedArtifact(source: string): string {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function required(value: string, name: string): void {
  if (value.trim() === "") throw new TypeError(`${name} must not be empty.`);
}
