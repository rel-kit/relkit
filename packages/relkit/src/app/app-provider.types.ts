import type {
  NormalizedProviderProfiles,
  ProviderAdapter,
  ProviderCapability,
  ProviderInput,
  ProviderSourceInput,
} from "../provider/index.js";
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
  /** Object storage for buckets: one adapter, or a map of named profiles. */
  readonly bucket?: CapabilityInput<"bucket">;
  /** Key-value storage for caches: one adapter, or a map of named profiles. */
  readonly cache?: CapabilityInput<"cache">;
  /** The backend that runs jobs and tasks: one adapter, or a map of named profiles. */
  readonly jobs?: CapabilityInput<"job">;
  /** The transport that delivers events: one adapter, or a map of named profiles. */
  readonly event?: CapabilityInput<"event">;
  /** Language models for agents: one adapter, or a map of named profiles. */
  readonly model?: CapabilityInput<"model">;
  /** The transport of realtime channels: one adapter, or a map of named profiles. */
  readonly realtime?: CapabilityInput<"realtime">;
  /** Storage for agent threads and runs: one adapter, or a map of named profiles. */
  readonly "agent-state"?: CapabilityInput<"agent-state">;
}

/** Provider bindings as one `defineApp` call infers them: a capability the call leaves out is
 * `undefined`, which is how a default for it is told apart from a default for a bound one.
 * @example const bindings: AppProviderBindings = { cache: redisAdapter, bucket: undefined };
 */
export type AppProviderBindings = {
  readonly [Key in keyof AppProviderInputs]?: AppProviderInputs[Key] | undefined;
};

/** The type a `defaults` entry has when the application binds no provider to its capability, so
 * the type error on that entry names the capability.
 * @example const missing: NoProviderConfigured<"cache"> = { capability: "cache" };
 */
export interface NoProviderConfigured<Capability extends string> {
  readonly capability: Capability;
}

type Profile<Input> = Input extends ProviderSourceInput ? "default" : Extract<keyof Input, string>;

/** The binding of one capability among the bindings of a `defineApp` call, or `undefined`.
 * @example type Cache = AppProviderBinding<{ cache: typeof redisAdapter }, "cache">;
 */
export type AppProviderBinding<Providers, Key> = Key extends keyof Providers
  ? Providers[Key]
  : undefined;

type DefaultProfile<Input, Key extends string> = [Input] extends [undefined]
  ? NoProviderConfigured<Key>
  : Profile<NonNullable<Input>>;

type ProviderInputFor<
  Providers extends AppProviderBindings,
  Capability extends AppProviderCapability,
> = Capability extends "job"
  ? "jobs" extends keyof Providers
    ? NonNullable<Providers["jobs"]>
    : never
  : Capability extends keyof Providers
    ? NonNullable<Providers[Capability]>
    : never;

type ProfileFor<Providers extends AppProviderBindings, Capability extends AppProviderCapability> = [
  ProviderInputFor<Providers, Capability>,
] extends [never]
  ? never
  : Profile<ProviderInputFor<Providers, Capability>>;

/** The provider options of `defineApp`, one property per capability so that each binding is
 * inferred from its own property.
 * @example const options: AppProviderOptions<{ cache: typeof redisAdapter }> = { cache: redisAdapter };
 */
export type AppProviderOptions<Providers extends AppProviderBindings> = {
  readonly [Key in keyof AppProviderInputs]?: AppProviderBinding<Providers, Key>;
};

/** Default profile per capability, named as the options are (`jobs`, not `job`). Each entry
 * accepts the profile names of that capability's binding, or `"default"` for a single adapter.
 * @example const defaults: AppProviderDefaults<typeof providers> = { cache: "default" };
 */
export type AppProviderDefaults<Providers extends AppProviderBindings> = {
  // NoInfer: a default never decides what a binding is; it is only checked against it.
  readonly [Key in keyof AppProviderInputs]?: NoInfer<
    DefaultProfile<AppProviderBinding<Providers, Key>, Key>
  >;
};

/** Validated default profiles keyed by normalized capability names.
 * @example const defaults: NormalizedAppProviderDefaults<typeof providers> = { cache: "default" };
 */
export type NormalizedAppProviderDefaults<Providers extends AppProviderBindings> = Readonly<{
  [Capability in AppProviderCapability]?: ProfileFor<Providers, Capability>;
}>;

/** The profile names of an application per capability, from the type of its descriptor. The
 * generated context registry uses it to type `profile` in buckets, caches, events and channels.
 * A capability without a provider has no names.
 * @example interface ApplicationProfiles extends ApplicationProfilesOf<typeof app> {}
 */
export type ApplicationProfilesOf<Application> = Application extends {
  readonly defaults: infer Defaults;
}
  ? { readonly [Capability in keyof Defaults]-?: NonNullable<Defaults[Capability]> }
  : {};

/** Provider profiles inferred from the authored provider bindings.
 * @example type Profiles = NormalizedProviders<typeof providers>;
 */
export type NormalizedProviders<Providers extends AppProviderBindings> = {
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
