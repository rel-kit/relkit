import type { RuntimeProviderContext, RuntimeProviderIntegration } from "relkit/provider";
import { createCloudflareKvCacheProvider } from "./kv.js";
import { createCloudflareR2BucketProvider } from "./r2.js";
import {
  createCloudflareKvBindingCacheProvider,
  createCloudflareR2BindingBucketProvider,
} from "./binding-providers.js";

export * from "./kv.js";
export * from "./r2.js";
export * from "./binding-providers.js";

/** @experimental */
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
    {
      capability: "cache",
      adapterId: "cloudflare-kv-binding",
      protocolVersion: 1,
      create: ({ profile, behavior }: RuntimeProviderContext) => {
        const provider = createCloudflareKvBindingCacheProvider({
          binding: text(record(behavior, "Cloudflare KV binding").binding, "Cloudflare KV binding"),
          cacheId: profile,
        });
        return { value: provider, release: provider.close };
      },
    },
    {
      capability: "bucket",
      adapterId: "cloudflare-r2-binding",
      protocolVersion: 1,
      create: ({ behavior }: RuntimeProviderContext) => ({
        value: createCloudflareR2BindingBucketProvider({
          binding: text(record(behavior, "Cloudflare R2 binding").binding, "Cloudflare R2 binding"),
        }),
      }),
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
