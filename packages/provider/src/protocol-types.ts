import type { JsonValue } from "@relkit/contracts";

declare const providerProtocolType: unique symbol;

type ProviderProtocolType<Name extends string> = {
  readonly [providerProtocolType]: Name;
};

export const PROVIDER_PROTOCOL_VERSION = 1 as const;
export type ProviderProtocolVersion = typeof PROVIDER_PROTOCOL_VERSION;

export type BindingValueType =
  "string" | "number" | "boolean" | "port" | "url" | "json" | "secret-string";

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

export type ProviderCapability<Id extends string = string> = Readonly<{
  kind: "provider-capability";
  id: Id;
}> &
  ProviderProtocolType<"capability">;

export type ProviderFeature<
  Capability extends string = string,
  Id extends string = string,
> = Readonly<{
  kind: "provider-feature";
  capability: Capability;
  id: Id;
}> &
  ProviderProtocolType<"feature">;

export type ProviderConnectionValueMode = "fixed" | "fallback";

export interface ProviderConnectionFieldInput {
  readonly required?: boolean;
  readonly sensitive?: boolean;
  readonly authoredValue?: ProviderConnectionValueMode;
  readonly default?: JsonValue;
}

export interface ProviderConnectionField {
  readonly required: boolean;
  readonly sensitive: boolean;
  readonly authoredValue: ProviderConnectionValueMode;
  readonly default?: JsonValue;
}

export type ProviderConnectionFields = Readonly<Record<string, ProviderConnectionField>>;

export type ProviderConnectionContract<
  Fields extends ProviderConnectionFields = ProviderConnectionFields,
> = Readonly<{
  kind: "provider-connection-contract";
  fields: Fields;
}> &
  ProviderProtocolType<"connection-contract">;

export type ProviderBehavior<Value extends JsonValue = JsonValue> = Readonly<{
  kind: "provider-behavior";
  value: Value;
}> &
  ProviderProtocolType<"behavior">;

export type ProviderAccess<Value extends JsonValue = JsonValue> = Readonly<{
  kind: "provider-access";
  value: Value;
}> &
  ProviderProtocolType<"access">;

export type IntegrationReference<Id extends string = string> = Readonly<{
  kind: "integration-reference";
  integrationId: Id;
}> &
  ProviderProtocolType<"integration-reference">;

export type ProviderConnectionValue = JsonValue | BindingValueRef;
export type ProviderConnectionValues = Readonly<Record<string, ProviderConnectionValue>>;

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

export type LocalProviderSource<Adapter extends ProviderAdapter = ProviderAdapter> = Readonly<{
  kind: "provider-local-source";
  adapter: Adapter;
}> &
  ProviderProtocolType<"local-source">;

export type InfrastructureProviderSource<Adapter extends ProviderAdapter = ProviderAdapter> =
  Readonly<{
    kind: "provider-infrastructure-source";
    adapter: Adapter;
    integration: IntegrationReference;
    options: JsonValue;
    access?: ProviderAccess;
  }> &
    ProviderProtocolType<"infrastructure-source">;

export type ProviderSourceInput<Adapter extends ProviderAdapter = ProviderAdapter> =
  Adapter | LocalProviderSource<Adapter> | InfrastructureProviderSource<Adapter>;

export type ProviderBindingSource =
  | Readonly<{ kind: "connected" }>
  | Readonly<{ kind: "local-only" }>
  | Readonly<{
      kind: "infrastructure";
      integrationId: string;
      options: JsonValue;
    }>;

export interface ProviderLocalRecipeReference {
  readonly integrationId: string;
  readonly recipeId: string;
  readonly recipeVersion: number;
}

export type NormalizedProviderSource<Adapter extends ProviderAdapter = ProviderAdapter> = Readonly<{
  kind: "normalized-provider-source";
  adapter: Adapter;
  source: ProviderBindingSource;
  local?: ProviderLocalRecipeReference;
  access?: JsonValue;
}> &
  ProviderProtocolType<"normalized-source">;

export interface NormalizedProviderAdapter {
  readonly integrationId: string;
  readonly adapterId: string;
  readonly protocolVersion: ProviderProtocolVersion;
  readonly behavior: JsonValue;
  readonly connectionContract: ProviderConnectionFields;
  readonly connection: ProviderConnectionValues;
  readonly features: readonly string[];
}

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
