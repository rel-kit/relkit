import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";
import { createCloudflareKvCacheProvider } from "./kv.js";
import { createCloudflareR2BucketProvider } from "./r2.js";

export * from "./kv.js";
export * from "./r2.js";

export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "cloudflare",
  registrations: Object.freeze([
    {
      capability: "bucket",
      adapterId: "cloudflare-r2",
      protocolVersion: 1,
      create: ({ connection, behavior }: RuntimeProviderContext) => ({
        value: createCloudflareR2BucketProvider({
          accountId: text(connection.accountId, "Cloudflare R2 accountId"),
          bucketName: text(connection.bucketName, "Cloudflare R2 bucketName"),
          accessKeyId: text(connection.accessKeyId, "Cloudflare R2 accessKeyId"),
          secretAccessKey: text(connection.secretAccessKey, "Cloudflare R2 secretAccessKey"),
          signedUrlTtlSeconds: record(behavior, "Cloudflare R2 behavior")
            .signedUrlTtlSeconds as number,
        }),
      }),
    },
    {
      capability: "cache",
      adapterId: "cloudflare-kv",
      protocolVersion: 1,
      create: ({ profile, connection }: RuntimeProviderContext) => {
        const provider = createCloudflareKvCacheProvider({
          accountId: text(connection.accountId, "Cloudflare KV accountId"),
          namespaceId: text(connection.namespaceId, "Cloudflare KV namespaceId"),
          apiToken: text(connection.apiToken, "Cloudflare KV apiToken"),
          cacheId: profile,
        });
        return { value: provider, ready: provider.ready, release: provider.close };
      },
    },
  ]),
}) satisfies RuntimeProviderIntegration<"cloudflare">;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} is invalid`);
  return value as Readonly<Record<string, unknown>>;
}
