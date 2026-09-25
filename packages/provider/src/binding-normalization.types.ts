/** Required features for a logical descriptor's selected provider. */
export interface NormalizeProviderBindingOptions {
  readonly descriptorId: string;
  readonly requiredFeatures?: readonly string[];
}
