/** Hashes identifying the artifacts that a runtime activation must load together. */
export interface RuntimeActivationFingerprint {
  readonly graphHash: string;
  readonly manifestHash: string;
  readonly jobsManifestHash?: string;
  readonly runtimeIntegrationsPlanHash: string;
  readonly localServicesPlanHash?: string;
  readonly providerOverridesGeneration?: string;
  /** Hash of the installed versions of third-party schema libraries the app's contracts use. */
  readonly schemaLibrariesHash?: string;
}
