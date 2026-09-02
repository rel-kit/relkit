export const DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION = 1 as const;

export type DeploymentIntegrationRole = "engine" | "host" | "infrastructure" | "access";

export interface DeploymentIntegrationMetadata<
  IntegrationId extends string = string,
  Role extends DeploymentIntegrationRole = DeploymentIntegrationRole,
> {
  readonly kind: "deployment-integration";
  readonly protocolVersion: typeof DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION;
  readonly integrationId: IntegrationId;
  readonly role: Role;
}
