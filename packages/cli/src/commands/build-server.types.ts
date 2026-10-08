/** Validated HTTP settings supplied to the pure generated-server emitter. */
export interface ServerSourceConfiguration {
  readonly maxBodyBytes: number;
  readonly apiDocs: {
    readonly enabledInProduction: boolean;
    readonly excludeDomains?: readonly string[];
  };
  readonly clientContract: boolean;
  readonly mcp: boolean;
  readonly maxPreviewBytes: number;
}

/** Pure source fragments derived from activation identities and declared features. */
export interface ServerSourceOptions {
  readonly specializedImports: string;
  readonly localServicesImport: string;
  readonly jobsManifestImport: string;
  readonly jobsManifestVerification: string;
  readonly localServicesVerification: string;
  readonly localServicesInspectorSource: string;
  readonly providerOverridesImport: string;
  readonly providerOverridesSource: string;
}
