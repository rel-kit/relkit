import type {
  ProviderRegistryErrorCode,
  ProviderRegistryIssue,
} from "./provider-registry.types.js";
export type {
  AcquiredProvider,
  ProviderCapability,
  ProviderHandle,
  ProviderRegistry,
  ProviderRegistryErrorCode,
  ProviderRegistryIssue,
  ProviderRegistryOptions,
  ProviderReplacements,
  ProviderRequirement,
  ProviderScopedValues,
} from "./provider-registry.types.js";

/** Compatibility error containing redacted provider startup, lookup or release issues. */
export class ProviderRegistryError extends Error {
  readonly code: ProviderRegistryErrorCode;
  readonly issues: readonly ProviderRegistryIssue[];

  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param issues - Mutable safe diagnostics collected during verification.
   * @returns undefined
   */
  constructor(issues: readonly ProviderRegistryIssue[]) {
    const stable = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super(stable.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "ProviderRegistryError";
    this.code = stable[0]?.code ?? "RELKIT_PROVIDER_METADATA_INVALID";
    this.issues = stable;
  }
}
