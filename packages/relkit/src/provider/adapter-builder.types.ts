import type {
  IntegrationReference,
  ProviderAdapter,
  ProviderBehavior,
  ProviderCapability,
  ProviderConnectionContract,
  ProviderConnectionValues,
  ProviderFeature,
  ProviderLocalRecipeReference,
} from "./protocol.types.js";
/** Inputs accepted by a provider adapter builder. */
export interface DefineProviderAdapterOptions<
  Capability extends ProviderCapability,
  AdapterId extends string,
  Connection extends ProviderConnectionValues,
  Behavior extends ProviderBehavior,
> {
  readonly integration: IntegrationReference;
  readonly capability: Capability;
  readonly adapterId: AdapterId;
  readonly connectionContract: ProviderConnectionContract;
  readonly connection: Connection;
  readonly behavior: Behavior;
  readonly features?: readonly ProviderFeature<Capability["id"]>[];
  readonly localRecipe?: ProviderLocalRecipeReference;
}
/** Adapter produced from a typed builder input. */
export type BuiltProviderAdapter<
  Capability extends ProviderCapability,
  AdapterId extends string,
  Connection extends ProviderConnectionValues,
  Behavior extends ProviderBehavior,
> = ProviderAdapter<Capability, AdapterId, Connection, Behavior>;
