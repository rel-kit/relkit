import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  isBindingValueRef,
  type BindingValueRef,
  type ProviderAdapter,
  type ProviderBehavior,
  type ProviderConnectionValues,
} from "@relkit/provider";

const cache = defineProviderCapability("cache");
const bucket = defineProviderCapability("bucket");
const integration = defineIntegrationReference("cloudflare");
const signedReadUrl = defineProviderFeature(bucket, "signedReadUrl");
const signedWriteUrl = defineProviderFeature(bucket, "signedWriteUrl");
const kvContract = defineConnectionContract({
  accountId: {},
  namespaceId: {},
  apiToken: { sensitive: true },
});
const r2Contract = defineConnectionContract({
  accountId: {},
  bucketName: {},
  accessKeyId: { sensitive: true },
  secretAccessKey: { sensitive: true },
});

type TextReference = BindingValueRef<string, string, "string">;
type SecretReference = BindingValueRef<string, string, "secret-string">;
type TextValue = string | TextReference;

export interface CloudflareKvOptions {
  readonly accountId: TextValue;
  readonly namespaceId: TextValue;
  readonly apiToken: SecretReference;
}

export interface CloudflareR2Options {
  readonly accountId: TextValue;
  readonly bucketName: TextValue;
  readonly credentials: Readonly<{
    accessKeyId: SecretReference;
    secretAccessKey: SecretReference;
  }>;
  readonly signedUrlTtlSeconds?: number;
}

export type CloudflareKvAdapter = ProviderAdapter<
  typeof cache,
  "cloudflare-kv",
  ProviderConnectionValues,
  ProviderBehavior<Readonly<{ minimumTtlMs: 60_000 }>>
>;

export type CloudflareR2Adapter = ProviderAdapter<
  typeof bucket,
  "cloudflare-r2",
  ProviderConnectionValues,
  ProviderBehavior<Readonly<{ signedUrlTtlSeconds: number }>>
>;

/**
 * Defines a connected Cloudflare Workers KV cache.
 * @category Integrations
 * @since 0.2.0
 */
export function kv(options: CloudflareKvOptions): CloudflareKvAdapter {
  assertRecord(options, "Cloudflare KV options");
  assertKeys(options, ["accountId", "namespaceId", "apiToken"], "Cloudflare KV option");
  textValue(options.accountId, "Cloudflare KV accountId");
  textValue(options.namespaceId, "Cloudflare KV namespaceId");
  secret(options.apiToken, "Cloudflare KV apiToken");
  return defineProviderAdapter({
    integration,
    capability: cache,
    adapterId: "cloudflare-kv",
    connectionContract: kvContract,
    connection: {
      accountId: options.accountId,
      namespaceId: options.namespaceId,
      apiToken: options.apiToken,
    },
    behavior: defineProviderBehavior({ minimumTtlMs: 60_000 }),
  });
}

/**
 * Defines a connected Cloudflare R2 bucket through its S3-compatible API.
 * @category Integrations
 * @since 0.2.0
 */
export function r2(options: CloudflareR2Options): CloudflareR2Adapter {
  assertRecord(options, "Cloudflare R2 options");
  assertKeys(
    options,
    ["accountId", "bucketName", "credentials", "signedUrlTtlSeconds"],
    "Cloudflare R2 option",
  );
  textValue(options.accountId, "Cloudflare R2 accountId");
  textValue(options.bucketName, "Cloudflare R2 bucketName");
  assertRecord(options.credentials, "Cloudflare R2 credentials");
  assertKeys(options.credentials, ["accessKeyId", "secretAccessKey"], "Cloudflare R2 credential");
  secret(options.credentials.accessKeyId, "Cloudflare R2 credentials.accessKeyId");
  secret(options.credentials.secretAccessKey, "Cloudflare R2 credentials.secretAccessKey");
  const ttl = options.signedUrlTtlSeconds ?? 900;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 604_800)
    throw new RangeError("Cloudflare R2 signedUrlTtlSeconds must be between 1 and 604800");
  return defineProviderAdapter({
    integration,
    capability: bucket,
    adapterId: "cloudflare-r2",
    connectionContract: r2Contract,
    connection: {
      accountId: options.accountId,
      bucketName: options.bucketName,
      accessKeyId: options.credentials.accessKeyId,
      secretAccessKey: options.credentials.secretAccessKey,
    },
    behavior: defineProviderBehavior({ signedUrlTtlSeconds: ttl }),
    features: [signedReadUrl, signedWriteUrl],
  });
}

function textValue(value: unknown, label: string): void {
  if (isBindingValueRef(value)) {
    if (value.type !== "string" || value.sensitive)
      throw new TypeError(`${label} must be text or a named text binding value`);
    return;
  }
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be non-empty text`);
}

function secret(value: unknown, label: string): void {
  if (!isBindingValueRef(value) || value.type !== "secret-string" || !value.sensitive)
    throw new TypeError(`${label} must be a named secret binding value`);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
}

function assertKeys(value: object, allowed: readonly string[], label: string): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value))
    if (!keys.has(key)) throw new TypeError(`Unknown ${label} "${key}"`);
}
