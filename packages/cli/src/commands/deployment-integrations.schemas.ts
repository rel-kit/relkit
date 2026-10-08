import { Schema } from "effect";
import { DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION } from "@relkit/deploy";

/** Deployment package metadata, owned by the provider-neutral protocol. */
export const deploymentIntegrationMetadataSchema = Schema.Struct({
  kind: Schema.Literal("deployment-integration"),
  protocolVersion: Schema.Literal(DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION),
  integrationId: Schema.String,
  role: Schema.Literals(["engine", "host", "infrastructure", "access"]),
});
