import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceRecipe,
  type LocalServiceRecipeOutputContext,
} from "@relkit/local-service";
import { signedRequest } from "../runtime/signing.js";

const MINIO_IMAGE =
  "minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e";
const BUCKET = "relkit";
const REGION = "us-east-1";

export const localRecipe = Object.freeze({
  kind: "local-service-recipe",
  protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
  integrationId: "s3",
  recipeId: "minio-docker",
  recipeVersion: 1,
  materializerId: "docker",
  image: MINIO_IMAGE,
  command: Object.freeze(["server", "/data", "--console-address", ":9001"]),
  ports: Object.freeze({ api: 9000, console: 9001 }),
  volume: Object.freeze({ mountPath: "/data" }),
  health: Object.freeze({
    command: Object.freeze([
      "curl",
      "--fail",
      "--silent",
      "http://127.0.0.1:9000/minio/health/ready",
    ]),
    intervalMs: 500,
    timeoutMs: 2_000,
    retries: 60,
  }),
  generatedSecrets: Object.freeze({
    accessKeyId: Object.freeze({ bytes: 12 }),
    secretAccessKey: Object.freeze({ bytes: 24 }),
  }),
  environment: Object.freeze({
    MINIO_ROOT_USER: Object.freeze({ secret: "accessKeyId" }),
    MINIO_ROOT_PASSWORD: Object.freeze({ secret: "secretAccessKey" }),
  }),
  outputs: (context: LocalServiceRecipeOutputContext) => Object.freeze(settings(context)),
  initialize: async (context: LocalServiceRecipeOutputContext) => {
    const values = settings(context);
    const response = await signedRequest(`${values.endpoint}/${BUCKET}`, {
      region: REGION,
      credentials: {
        accessKeyId: values.accessKeyId,
        secretAccessKey: values.secretAccessKey,
      },
      ...(context.fetch === undefined ? {} : { fetch: context.fetch }),
      init: {
        method: "PUT",
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      },
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`MinIO bucket initialization failed with status ${response.status}.`);
    }
  },
}) satisfies LocalServiceRecipe<"s3">;

function settings(context: LocalServiceRecipeOutputContext) {
  const apiPort = context.ports.api;
  if (
    typeof apiPort !== "number" ||
    !Number.isSafeInteger(apiPort) ||
    apiPort < 1 ||
    apiPort > 65_535
  ) {
    throw new TypeError("MinIO local API port is invalid");
  }
  return {
    endpoint: `http://127.0.0.1:${apiPort}`,
    bucketName: BUCKET,
    region: REGION,
    accessKeyId: text(context.secrets.accessKeyId, "access key"),
    secretAccessKey: text(context.secrets.secretAccessKey, "secret key"),
  } as const;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "")
    throw new TypeError(`MinIO local ${name} is invalid`);
  return value;
}
