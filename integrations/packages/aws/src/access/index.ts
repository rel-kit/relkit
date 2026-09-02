import {
  DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  type DeploymentAccessIntegration,
} from "@relkit/deploy";
import { materializeAwsAccess } from "./materialize.js";

export const awsAccess = Object.freeze({
  kind: "deployment-integration",
  protocolVersion: DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  integrationId: "aws",
  role: "access",
  materialize: materializeAwsAccess,
}) satisfies DeploymentAccessIntegration;

export const deploymentIntegration = awsAccess;
