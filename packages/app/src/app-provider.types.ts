import type {
  NormalizedProviderProfiles,
  ProviderAdapter,
  ProviderCapability,
  ProviderInput,
  ProviderSourceInput,
} from "@relkit/provider";
import type { APP_PROVIDER_CAPABILITIES } from "./app-provider-capabilities.js";

/** Provider capabilities accepted by the application descriptor.
 * @example const capability: AppProviderCapability = "cache";
 */
export type AppProviderCapability = (typeof APP_PROVIDER_CAPABILITIES)[number];

type CapabilityInput<Capability extends AppProviderCapability> = ProviderInput<
  ProviderSourceInput<ProviderAdapter<ProviderCapability<Capability>>>
>;

/** Optional provider bindings for every supported capability.
 * @example const providers: AppProviderInputs = { cache: redisAdapter };
 */
export interface AppProviderInputs {
  readonly bucket?: CapabilityInput<"bucket">;
  readonly cache?: CapabilityInput<"cache">;
  /** Public plural spelling for the jobs provider capability. */
  readonly jobs?: CapabilityInput<"job">;
  /** @deprecated Use `jobs`. */
  readonly job?: CapabilityInput<"job">;
  readonly event?: CapabilityInput<"event">;
  readonly model?: CapabilityInput<"model">;
  readonly realtime?: CapabilityInput<"realtime">;
  readonly "agent-state"?: CapabilityInput<"agent-state">;
}

type Profile<Input> = Input extends ProviderSourceInput ? "default" : Extract<keyof Input, string>;

type ProviderInputFor<
  Providers extends AppProviderInputs,
  Capability extends AppProviderCapability,
> = Capability extends "job"
  ? "jobs" extends keyof Providers
    ? NonNullable<Providers["jobs"]>
    : "job" extends keyof Providers
      ? NonNullable<Providers["job"]>
      : never
  : Capability extends keyof Providers
    ? NonNullable<Providers[Capability]>
    : never;

type ProfileFor<Providers extends AppProviderInputs, Capability extends AppProviderCapability> = [
  ProviderInputFor<Providers, Capability>,
] extends [never]
  ? never
  : Profile<ProviderInputFor<Providers, Capability>>;

/** Public default-profile spellings; normalized descriptors use `job`.
 * @example const defaults: AppProviderDefaults<typeof providers> = { cache: "default" };
 */
export type AppProviderDefaults<Providers extends AppProviderInputs> = Readonly<{
  [Capability in Exclude<AppProviderCapability, "job">]?: ProfileFor<Providers, Capability>;
}> & {
  readonly jobs?: ProfileFor<Providers, "job">;
  /** @deprecated Use `jobs`. */
  readonly job?: ProfileFor<Providers, "job">;
};

/** Validated default profiles keyed by normalized capability names.
 * @example const defaults: NormalizedAppProviderDefaults<typeof providers> = { cache: "default" };
 */
export type NormalizedAppProviderDefaults<Providers extends AppProviderInputs> = Readonly<{
  [Capability in AppProviderCapability]?: ProfileFor<Providers, Capability>;
}>;

/** Provider profiles inferred from the authored provider bindings.
 * @example type Profiles = NormalizedProviders<typeof providers>;
 */
export type NormalizedProviders<Providers extends AppProviderInputs> = {
  readonly [
    Capability in AppProviderCapability as [ProviderInputFor<Providers, Capability>] extends [never]
      ? never
      : Capability
  ]: NormalizedProviderProfiles<AdapterOf<ProviderInputFor<Providers, Capability>>>;
};

type AdapterOf<Input> =
  Input extends ProviderSourceInput<infer Adapter>
    ? Adapter
    : Input extends Readonly<Record<string, infer Binding>>
      ? Binding extends ProviderSourceInput<infer Adapter>
        ? Adapter
        : never
      : never;
