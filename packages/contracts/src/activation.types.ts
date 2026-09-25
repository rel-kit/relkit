/** Hashes identifying the artifacts that a runtime activation must load together. */
export interface RuntimeActivationFingerprint {
  readonly graphHash: string;
  readonly manifestHash: string;
  readonly jobsManifestHash?: string;
  readonly runtimeIntegrationsPlanHash: string;
  readonly localServicesPlanHash?: string;
  readonly providerOverridesGeneration?: string;
}
