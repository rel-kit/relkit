/** Accepted graph identity and exact executable artifact bytes to hash. */
export interface RuntimeActivationFingerprintInput {
  readonly graphHash: string;
  readonly manifestSource: string;
  readonly jobsManifestSource?: string;
  readonly runtimeIntegrationsPlanSource: string;
  readonly localServicesPlanSource?: string;
  readonly providerOverridesGeneration?: string;
  /** Installed version of each third-party schema library, keyed by `~standard.vendor`. */
  readonly schemaLibraries?: Readonly<Record<string, string>>;
  /** An already computed library hash, carried by builds that do not recompile. */
  readonly schemaLibrariesHash?: string;
}
