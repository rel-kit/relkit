import {
  DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  type DeploymentHostIntegration,
} from "@relkit/deploy";
import { materializeAwsHost } from "./materialize.js";

/** @experimental */
export const awsHost = Object.freeze({
  kind: "deployment-integration",
  protocolVersion: DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
  integrationId: "aws",
  role: "host",
  materialize: materializeAwsHost,
}) satisfies DeploymentHostIntegration;

/** @experimental */
export const deploymentIntegration = awsHost;
