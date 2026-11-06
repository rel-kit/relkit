import type {
  NormalizedProviderSource,
  ProviderAdapter,
  ProviderSourceInput,
} from "./protocol.types.js";
/** A direct binding or a map of named provider profiles. */
export type ProviderInput<Binding> = Binding | Readonly<Record<string, Binding>>;
/** Immutable provider sources keyed by normalized profile name. */
export interface NormalizedProviderProfiles<Adapter extends ProviderAdapter = ProviderAdapter> {
  readonly kind: "normalized-provider-profiles";
  readonly capability: string;
  readonly profiles: Readonly<Record<string, NormalizedProviderSource<Adapter>>>;
}
/** How a profile was selected. */
export type ProviderProfileSelectionSource = "descriptor" | "default" | "sole";
/** Selected profile with the matching normalized binding. */
export interface ProviderProfileSelection<Adapter extends ProviderAdapter = ProviderAdapter> {
  readonly capability: string;
  readonly profile: string;
  readonly source: ProviderProfileSelectionSource;
  readonly binding: NormalizedProviderSource<Adapter>;
}
/** Source accepted by profile normalization. */
export type ProviderProfileSource<Adapter extends ProviderAdapter> = ProviderInput<
  ProviderSourceInput<Adapter>
>;
/** Descriptor and optional application-level default profile selection. */
export interface SelectProviderProfileOptions {
  readonly descriptorId: string;
  readonly profile?: string;
  readonly defaultProfile?: string;
}
