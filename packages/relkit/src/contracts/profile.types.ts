declare global {
  namespace Relkit {
    /** Generated: the profile names of the application's providers, per capability. */
    interface ApplicationProfiles {}
  }
}

/** A provider profile a descriptor may name for one capability, such as `bucket` or `cache`: one
 * the application configures (`"default"` for a single adapter), or any string when the generated
 * registry carries no names for the capability.
 * @example const profile: ProviderProfileName<"bucket"> = "uploads";
 */
export type ProviderProfileName<Capability extends string> = Relkit.ApplicationProfiles extends {
  readonly [Key in Capability]: infer Name extends string;
}
  ? [Name] extends [never]
    ? string
    : Name
  : string;

export {};
