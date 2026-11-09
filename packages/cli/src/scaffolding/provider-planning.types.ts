/**
 * Resource capability whose provider profile is planned.
 */
export type ProviderCapability = "cache" | "bucket" | "event" | "job";

/**
 * Explicit profile/provider/source selection.
 */
export interface EnsureProfileOptions {
  readonly requested?: string | undefined;
  readonly provider?: string | undefined;
  readonly source?: "docker" | "connected" | "aws" | undefined;
}
