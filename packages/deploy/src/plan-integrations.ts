import type { JsonValue } from "@relkit/contracts";
import type { DeploymentIntegrationRole } from "./integration.js";

export interface DeploymentIntegrationPlan<
  Role extends DeploymentIntegrationRole = DeploymentIntegrationRole,
> {
  readonly role: Role;
  readonly integrationId: string;
  readonly protocolVersion: 1;
  readonly configuration: JsonValue;
}

export interface DeploymentAdapterPlan {
  readonly integrationId: string;
  readonly adapterId: string;
  readonly protocolVersion: 1;
  readonly behavior: JsonValue;
  readonly connectionContract: JsonValue;
  readonly connection: JsonValue;
  readonly features: readonly string[];
}

export interface DeploymentNamedValuePlan {
  readonly field: string;
  readonly name: string;
  readonly type: string;
  readonly sensitive: boolean;
}

export interface DeploymentBindingRuntimePlan {
  readonly bindingId: string;
  readonly capability: string;
  readonly profile: string;
  readonly adapter: DeploymentAdapterPlan;
  readonly namedValues: readonly DeploymentNamedValuePlan[];
}

export interface ConnectedBindingPlan extends DeploymentBindingRuntimePlan {
  readonly kind: "connected-binding";
}

export interface InfrastructureOperationPlan extends DeploymentBindingRuntimePlan {
  readonly kind: "infrastructure-operation";
  readonly id: string;
  readonly integration: DeploymentIntegrationPlan<"infrastructure">;
}

export interface AccessOperationPlan {
  readonly kind: "access-operation";
  readonly id: string;
  readonly bindingId: string;
  readonly integration: DeploymentIntegrationPlan<"access">;
}
