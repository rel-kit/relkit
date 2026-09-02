import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceMaterializerMetadata,
} from "@relkit/local-service";

export * from "./docker-client.js";
export * from "./docker-materializer.js";
export * from "./docker-types.js";

export const dockerMaterializer = Object.freeze({
  kind: "local-service-materializer",
  protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
  integrationId: "docker",
}) satisfies LocalServiceMaterializerMetadata<"docker">;
