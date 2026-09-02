import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";
import { createS3BucketProvider } from "./s3.js";

export * from "./s3.js";
export type { S3Credentials } from "./signing.js";

export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "s3",
  registrations: Object.freeze([
    {
      capability: "bucket",
      adapterId: "s3",
      protocolVersion: 1,
      create: ({ connection, behavior }: RuntimeProviderContext) => {
        const settings = record(behavior, "S3 behavior");
        return {
          value: createS3BucketProvider({
            endpoint: text(connection.endpoint, "S3 endpoint"),
            bucketName: text(connection.bucketName, "S3 bucketName"),
            region: text(connection.region, "S3 region"),
            ...credentials(connection),
            forcePathStyle: settings.forcePathStyle as boolean,
            signedUrlTtlSeconds: settings.signedUrlTtlSeconds as number,
          }),
        };
      },
    },
  ]),
}) satisfies RuntimeProviderIntegration<"s3">;

function credentials(connection: Readonly<Record<string, unknown>>) {
  const accessKeyId = connection.accessKeyId;
  const secretAccessKey = connection.secretAccessKey;
  const sessionToken = connection.sessionToken;
  if (accessKeyId === undefined && secretAccessKey === undefined && sessionToken === undefined)
    return {};
  return {
    credentials: {
      accessKeyId: text(accessKeyId, "S3 accessKeyId"),
      secretAccessKey: text(secretAccessKey, "S3 secretAccessKey"),
      ...(sessionToken === undefined
        ? {}
        : { sessionToken: text(sessionToken, "S3 sessionToken") }),
    },
  };
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} is invalid`);
  return value as Readonly<Record<string, unknown>>;
}
