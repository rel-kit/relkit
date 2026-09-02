import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase } from "./model.js";

export const PROVIDER_CAPABILITIES = ["bucket", "cache", "job", "event", "model"] as const;

export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

export interface ProviderConnectionFieldProjection {
  readonly required: boolean;
  readonly sensitive: boolean;
  readonly authoredValue: "fixed" | "fallback";
  readonly default?: JsonValue;
}

export interface ProviderAdapterProjection {
  readonly integrationId: string;
  readonly adapterId: string;
  readonly protocolVersion: 1;
  readonly behavior: JsonValue;
  readonly connectionContract: Readonly<Record<string, ProviderConnectionFieldProjection>>;
  readonly connection: Readonly<Record<string, JsonValue>>;
  readonly features: readonly string[];
}

export type ProviderSourceProjection =
  | Readonly<{ kind: "connected" }>
  | Readonly<{ kind: "local-only" }>
  | Readonly<{
      kind: "infrastructure";
      integrationId: string;
      options: JsonValue;
    }>;

export interface ProviderNamedValueProjection {
  readonly field: string;
  readonly name: string;
  readonly type: string;
  readonly sensitive: boolean;
}

export interface ProviderLocalRecipeProjection {
  readonly integrationId: string;
  readonly recipeId: string;
  readonly recipeVersion: number;
}

export type DeploymentRole = "engine" | "host" | "infrastructure" | "access";

export interface DeploymentRoleProjection {
  readonly role: DeploymentRole;
  readonly integrationId: string;
  readonly protocolVersion: 1;
  readonly configuration: JsonValue;
}

export interface ProviderBindingNode extends GraphNodeBase<"provider"> {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly adapter: ProviderAdapterProjection;
  readonly providerSource: ProviderSourceProjection;
  readonly namedValues: readonly ProviderNamedValueProjection[];
  readonly local?: ProviderLocalRecipeProjection;
  readonly access?: JsonValue;
  readonly deploymentRoles: readonly DeploymentRoleProjection[];
}
