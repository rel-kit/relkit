import type { ProviderBindingResolutionCode } from "./provider-errors.types.js";

/** Internal marker for expected provider input failures.
 * @example throw new ProviderInputError("Invalid provider ID");
 */
export class ProviderInputError extends TypeError {}
/** Synchronous profile selection error retained for compatibility.
 * @example throw new ProviderProfileSelectionError("UNKNOWN_PROVIDER_PROFILE", "cache", "cart", [], "selected unknown profile");
 */
export class ProviderProfileSelectionError extends TypeError {
  readonly code: "AMBIGUOUS_PROVIDER_PROFILE" | "UNKNOWN_PROVIDER_PROFILE";
  readonly capability: string;
  readonly descriptorId: string;
  readonly profiles: readonly string[];
  readonly reason: string;
  /** Create a profile selection error.
   * @param code - Stable selection code.
   * @param capability - Requested capability.
   * @param descriptorId - Logical descriptor.
   * @param profiles - Available profiles.
   * @param reason - Safe failure reason.
   */
  constructor(
    code: ProviderProfileSelectionError["code"],
    capability: string,
    descriptorId: string,
    profiles: readonly string[],
    reason: string,
  ) {
    super(
      `${capability} logical descriptor "${descriptorId}" ${reason}; available profiles: ${profiles.join(", ")}`,
    );
    this.name = "ProviderProfileSelectionError";
    this.code = code;
    this.capability = capability;
    this.descriptorId = descriptorId;
    this.profiles = profiles;
    this.reason = reason;
  }
}
/** Synchronous missing-feature error retained for compatibility.
 * @example throw new ProviderFeatureMismatchError("cache", "default", "cart", ["atomic"]);
 */
export class ProviderFeatureMismatchError extends TypeError {
  readonly code = "MISSING_PROVIDER_FEATURE" as const;
  readonly capability: string;
  readonly profile: string;
  readonly descriptorId: string;
  readonly features: readonly string[];
  /** Create a missing-feature error.
   * @param capability - Requested capability.
   * @param profile - Selected profile.
   * @param descriptorId - Logical descriptor.
   * @param features - Missing features.
   */
  constructor(
    capability: string,
    profile: string,
    descriptorId: string,
    features: readonly string[],
  ) {
    super(
      `${capability} logical descriptor "${descriptorId}" requires missing features from profile "${profile}": ${features.join(", ")}`,
    );
    this.name = "ProviderFeatureMismatchError";
    this.capability = capability;
    this.profile = profile;
    this.descriptorId = descriptorId;
    this.features = features;
  }
}
/** Synchronous connection error retained for compatibility.
 * @example throw new ProviderBindingResolutionError("MISSING_CONNECTION_VALUE", "cache.default", "url", "is required");
 */
export class ProviderBindingResolutionError extends TypeError {
  readonly code: ProviderBindingResolutionCode;
  readonly bindingId: string;
  readonly field: string;
  readonly reason: string;
  /** Create a connection resolution error.
   * @param code - Stable resolution code.
   * @param bindingId - Logical binding identity.
   * @param field - Connection field name.
   * @param reason - Safe failure reason.
   */
  constructor(
    code: ProviderBindingResolutionCode,
    bindingId: string,
    field: string,
    reason: string,
  ) {
    super(`${bindingId} connection field "${field}" ${reason}`);
    this.name = "ProviderBindingResolutionError";
    this.code = code;
    this.bindingId = bindingId;
    this.field = field;
    this.reason = reason;
  }
}
