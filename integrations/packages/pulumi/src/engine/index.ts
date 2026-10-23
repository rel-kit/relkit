/** Declares selected Pulumi engine metadata and exposes its owning deployment implementation. */
import {
  DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  type DeploymentIntegrationMetadata,
} from "@relkit/deploy";

export const pulumiEngine = Object.freeze({
  kind: "deployment-integration",
  protocolVersion: DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  integrationId: "pulumi",
  role: "engine",
}) satisfies DeploymentIntegrationMetadata<"pulumi", "engine">;

export const deploymentIntegration = pulumiEngine;

// The selected engine owns the implementation; authoring stays metadata-only.
export * from "@relkit/deploy-pulumi";
