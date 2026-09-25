import type { JsonValue } from "@relkit/contracts";
import type { PROVIDER_PROTOCOL_VERSION } from "./protocol.js";

declare const providerProtocolType: unique symbol;

type ProviderProtocolType<Name extends string> = {
  readonly [providerProtocolType]: Name;
};

/** Current version accepted by provider descriptors. */
export type ProviderProtocolVersion = typeof PROVIDER_PROTOCOL_VERSION;

/** Supported named binding value kinds. */
export type BindingValueType =
  "string" | "number" | "boolean" | "port" | "url" | "json" | "secret-string";

/** Opaque reference to a binding-local runtime value. */
export type BindingValueRef<
  Name extends string = string,
  Value = unknown,
  Type extends BindingValueType = BindingValueType,
> = Readonly<{
  kind: "binding-value-ref";
  name: Name;
  type: Type;
  sensitive: Type extends "secret-string" ? true : false;
  __value?: Value;
}> &
  ProviderProtocolType<"binding-value-ref">;

/** Nominal capability identity shared by features and adapters. */
export type ProviderCapability<Id extends string = string> = Readonly<{
  kind: "provider-capability";
  id: Id;
}> &
  ProviderProtocolType<"capability">;

/** Nominal feature identity within one provider capability. */
export type ProviderFeature<
  Capability extends string = string,
  Id extends string = string,
> = Readonly<{
  kind: "provider-feature";
  capability: Capability;
  id: Id;
}> &
  ProviderProtocolType<"feature">;

/** Whether authored connection values are fixed or allow outputs to replace them. */
export type ProviderConnectionValueMode = "fixed" | "fallback";

/** Authoring options for one connection field. */
export interface ProviderConnectionFieldInput {
  readonly required?: boolean;
  readonly sensitive?: boolean;
  readonly authoredValue?: ProviderConnectionValueMode;
  readonly default?: JsonValue;
}

/** Normalized field contract with explicit defaults. */
export interface ProviderConnectionField {
  readonly required: boolean;
  readonly sensitive: boolean;
  readonly authoredValue: ProviderConnectionValueMode;
  readonly default?: JsonValue;
}

/** Named connection fields in an adapter contract. */
export type ProviderConnectionFields = Readonly<Record<string, ProviderConnectionField>>;

/** Nominal connection contract for a provider adapter. */
export type ProviderConnectionContract<
  Fields extends ProviderConnectionFields = ProviderConnectionFields,
> = Readonly<{
  kind: "provider-connection-contract";
  fields: Fields;
}> &
  ProviderProtocolType<"connection-contract">;

/** Immutable behavioral metadata separate from connection values. */
export type ProviderBehavior<Value extends JsonValue = JsonValue> = Readonly<{
  kind: "provider-behavior";
  value: Value;
}> &
  ProviderProtocolType<"behavior">;

/** Access policy metadata for an infrastructure source. */
export type ProviderAccess<Value extends JsonValue = JsonValue> = Readonly<{
  kind: "provider-access";
  value: Value;
}> &
  ProviderProtocolType<"access">;

/** Static integration identity without an import path. */
export type IntegrationReference<Id extends string = string> = Readonly<{
  kind: "integration-reference";
  integrationId: Id;
}> &
  ProviderProtocolType<"integration-reference">;

/** Literal JSON or a named binding value reference. */
export type ProviderConnectionValue = JsonValue | BindingValueRef;
/** Authored connection field values. */
export type ProviderConnectionValues = Readonly<Record<string, ProviderConnectionValue>>;

/** Immutable adapter descriptor for one integration capability. */
export type ProviderAdapter<
  Capability extends ProviderCapability = ProviderCapability,
  AdapterId extends string = string,
  Connection extends ProviderConnectionValues = ProviderConnectionValues,
  Behavior extends ProviderBehavior = ProviderBehavior,
> = Readonly<{
  kind: "provider-adapter";
  protocolVersion: ProviderProtocolVersion;
  integration: IntegrationReference;
  capability: Capability;
  adapterId: AdapterId;
  connectionContract: ProviderConnectionContract;
  connection: Connection;
  behavior: Behavior;
  features: readonly ProviderFeature<Capability["id"]>[];
  localRecipe?: ProviderLocalRecipeReference;
}> &
  ProviderProtocolType<"adapter">;

/** Adapter wrapped with its declared local recipe. */
export type LocalProviderSource<Adapter extends ProviderAdapter = ProviderAdapter> = Readonly<{
  kind: "provider-local-source";
  adapter: Adapter;
}> &
  ProviderProtocolType<"local-source">;

/** Adapter and infrastructure materialization request. */
export type InfrastructureProviderSource<Adapter extends ProviderAdapter = ProviderAdapter> =
  Readonly<{
    kind: "provider-infrastructure-source";
    adapter: Adapter;
    integration: IntegrationReference;
    options: JsonValue;
    access?: ProviderAccess;
  }> &
    ProviderProtocolType<"infrastructure-source">;

/** Direct adapter or one source wrapper. */
export type ProviderSourceInput<Adapter extends ProviderAdapter = ProviderAdapter> =
  Adapter | LocalProviderSource<Adapter> | InfrastructureProviderSource<Adapter>;

/** Source mode selected for a normalized provider binding. */
export type ProviderBindingSource =
  | Readonly<{ kind: "connected" }>
  | Readonly<{ kind: "local-only" }>
  | Readonly<{
      kind: "infrastructure";
      integrationId: string;
      options: JsonValue;
    }>;

/** Versioned local recipe provenance for an adapter. */
export interface ProviderLocalRecipeReference {
  readonly integrationId: string;
  readonly recipeId: string;
  readonly recipeVersion: number;
}

/** Frozen source descriptor consumed by profile normalization. */
export type NormalizedProviderSource<Adapter extends ProviderAdapter = ProviderAdapter> = Readonly<{
  kind: "normalized-provider-source";
  adapter: Adapter;
  source: ProviderBindingSource;
  local?: ProviderLocalRecipeReference;
  access?: JsonValue;
}> &
  ProviderProtocolType<"normalized-source">;

/** Runtime-facing projection of an adapter's immutable fields. */
export interface NormalizedProviderAdapter {
  readonly integrationId: string;
  readonly adapterId: string;
  readonly protocolVersion: ProviderProtocolVersion;
  readonly behavior: JsonValue;
  readonly connectionContract: ProviderConnectionFields;
  readonly connection: ProviderConnectionValues;
  readonly features: readonly string[];
}

/** Selected provider binding consumed by the runtime. */
export type NormalizedProviderBinding = Readonly<{
  kind: "provider-binding";
  capability: string;
  profile: string;
  adapter: NormalizedProviderAdapter;
  source: ProviderBindingSource;
  local?: ProviderLocalRecipeReference;
  access?: JsonValue;
}> &
  ProviderProtocolType<"normalized-binding">;
