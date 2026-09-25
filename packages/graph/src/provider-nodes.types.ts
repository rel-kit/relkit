import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase } from "./model.types.js";
import type { PROVIDER_CAPABILITIES } from "./provider-nodes.js";

/**
 * Provider resource family supported by the graph.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: ProviderCapability): void => { console.log(value); };
 */
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

/**
 * Safe metadata for one provider connection field.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: ProviderConnectionFieldProjection): void => { console.log(value); };
 */
export interface ProviderConnectionFieldProjection {
  readonly required: boolean;
  readonly sensitive: boolean;
  readonly authoredValue: "fixed" | "fallback";
  readonly default?: JsonValue;
}

/**
 * Provider adapter identity and public connection contract.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: ProviderAdapterProjection): void => { console.log(value); };
 */
export interface ProviderAdapterProjection {
  readonly integrationId: string;
  readonly adapterId: string;
  readonly protocolVersion: 1;
  readonly behavior: JsonValue;
  readonly connectionContract: Readonly<Record<string, ProviderConnectionFieldProjection>>;
  readonly connection: Readonly<Record<string, JsonValue>>;
  readonly features: readonly string[];
}

/**
 * How a provider is connected or provisioned.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: ProviderSourceProjection): void => { console.log(value); };
 */
export type ProviderSourceProjection =
  | Readonly<{ kind: "connected" }>
  | Readonly<{ kind: "local-only" }>
  | Readonly<{
      kind: "infrastructure";
      integrationId: string;
      options: JsonValue;
    }>;

/**
 * Reference to a named provider connection value.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: ProviderNamedValueProjection): void => { console.log(value); };
 */
export interface ProviderNamedValueProjection {
  readonly field: string;
  readonly name: string;
  readonly type: string;
  readonly sensitive: boolean;
}

/**
 * Local recipe that can materialize a provider.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: ProviderLocalRecipeProjection): void => { console.log(value); };
 */
export interface ProviderLocalRecipeProjection {
  readonly integrationId: string;
  readonly recipeId: string;
  readonly recipeVersion: number;
}

/**
 * Deployment ownership role for an app or provider.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: DeploymentRole): void => { console.log(value); };
 */
export type DeploymentRole = "engine" | "host" | "infrastructure" | "access";

/**
 * Integration configuration assigned to one deployment role.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: DeploymentRoleProjection): void => { console.log(value); };
 */
export interface DeploymentRoleProjection {
  readonly role: DeploymentRole;
  readonly integrationId: string;
  readonly protocolVersion: 1;
  readonly configuration: JsonValue;
}

/**
 * Provider binding and deployment projection without live credentials.
 * @remarks This is metadata only; live provider clients and secrets stay outside the graph.
 * @example const inspect = (value: ProviderBindingNode): void => { console.log(value); };
 */
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
