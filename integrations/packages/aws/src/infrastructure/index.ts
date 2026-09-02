import {
  DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  type DeploymentInfrastructureIntegration,
} from "@relkit/deploy";
import { materializeAwsInfrastructure } from "./materialize.js";

export const awsInfrastructure = Object.freeze({
  kind: "deployment-integration",
  protocolVersion: DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  integrationId: "aws",
  role: "infrastructure",
  materialize: materializeAwsInfrastructure,
}) satisfies DeploymentInfrastructureIntegration;

export const deploymentIntegration = awsInfrastructure;
