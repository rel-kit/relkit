/** Accepted graph identity and exact executable artifact bytes to hash. */
export interface RuntimeActivationFingerprintInput {
  readonly graphHash: string;
  readonly manifestSource: string;
  readonly jobsManifestSource?: string;
  readonly runtimeIntegrationsPlanSource: string;
  readonly localServicesPlanSource?: string;
  readonly providerOverridesGeneration?: string;
}
