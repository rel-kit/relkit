import { createModelProviderRegistry } from "@relkit/agents";
import type { ProviderFactories, ProviderFactory, ProviderFactoryContext } from "@relkit/engine";
import { createRedisCacheProvider } from "./redis.js";
import { createS3BucketProvider, type S3BucketOptions } from "./s3.js";

const s3Factory: ProviderFactory = Object.freeze({
  capability: "buckets",
  adapter: "s3",
  create: (context: ProviderFactoryContext) => {
    const configuration = context.configuration;
    const credentials = s3Credentials(record(configuration.credentials));
    const provider = createS3BucketProvider({
      endpoint: urlText(configuration.endpoint, "S3 endpoint"),
      bucketName: text(configuration.bucketName, "S3 bucketName"),
      region: text(configuration.region, "S3 region"),
      ...(credentials === undefined ? {} : { credentials }),
      ...(configuration.forcePathStyle === undefined
        ? {}
        : { forcePathStyle: boolean(configuration.forcePathStyle, "S3 forcePathStyle") }),
      ...(configuration.signedUrlTtlSeconds === undefined
        ? {}
        : {
            signedUrlTtlSeconds: integer(
              configuration.signedUrlTtlSeconds,
              "S3 signedUrlTtlSeconds",
            ),
          }),
    } satisfies S3BucketOptions);
    return Object.freeze({ value: provider });
  },
});

const redisFactory: ProviderFactory = Object.freeze({
  capability: "cache",
  adapter: "redis",
  create: (context: ProviderFactoryContext) => {
    const provider = createRedisCacheProvider({
      url: text(context.configuration.url, "Redis URL"),
      cacheId: context.profile,
      ...(context.configuration.connectionTimeoutMs === undefined
        ? {}
        : {
            connectionTimeoutMs: integer(
              context.configuration.connectionTimeoutMs,
              "Redis connectionTimeoutMs",
            ),
          }),
    });
    return Object.freeze({ value: provider, ready: provider.ready, release: provider.close });
  },
});

const modelsFactory: ProviderFactory = Object.freeze({
  capability: "models",
  adapter: "ai-sdk",
  create: async (context: ProviderFactoryContext) => {
    const modelRegistry = await createModelProviderRegistry({
      configuration: context.configuration,
    });
    return Object.freeze({ modelRegistry });
  },
});

export const standardProviderFactories: ProviderFactories = Object.freeze({
  "buckets:s3": s3Factory,
  "cache:redis": redisFactory,
  "models:ai-sdk": modelsFactory,
});

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function s3Credentials(value: Record<string, unknown> | undefined): S3BucketOptions["credentials"] {
  if (value === undefined) return undefined;
  const accessKeyId = optionalText(value.accessKeyId, "S3 accessKeyId");
  const secretAccessKey = optionalText(value.secretAccessKey, "S3 secretAccessKey");
  const sessionToken = optionalText(value.sessionToken, "S3 sessionToken");
  if (accessKeyId === undefined && secretAccessKey === undefined && sessionToken === undefined)
    return undefined;
  if (accessKeyId === undefined || secretAccessKey === undefined) {
    throw new TypeError("S3 credentials require both accessKeyId and secretAccessKey");
  }
  return { accessKeyId, secretAccessKey, ...(sessionToken === undefined ? {} : { sessionToken }) };
}

function optionalText(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : text(value, label);
}

function urlText(value: unknown, label: string): string {
  return value instanceof URL ? value.toString() : text(value, label);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value.trim();
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} is invalid`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError(`${label} is invalid`);
  return value as number;
}
