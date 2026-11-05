/**
 * Cache and bucket providers on a Worker's own bindings. The binding is looked up through
 * `relkit/runtime/workers` on first use, so the provider can be created before the Worker's `env`
 * is known, and fails with the binding's name outside a Worker or when the binding is missing.
 * Only the binding methods RelKit needs are typed here, so the package needs no Workers types.
 */
import type { BucketObjectMetadata, BucketProvider, BucketPutOptions } from "relkit/buckets";
import type { CacheOperationOptions } from "relkit/cache";
import type { CacheProvider } from "relkit/cache";
import { canonicalJson } from "relkit/contracts";
import { workersBinding } from "relkit/runtime/workers";

/** The Workers KV namespace methods the cache uses. @experimental */
export interface KvNamespaceBinding {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { readonly expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** One R2 object's metadata as the binding returns it. */
interface R2ObjectHead {
  readonly key: string;
  readonly etag: string;
  readonly size: number;
  readonly httpMetadata?: { readonly contentType?: string };
  readonly customMetadata?: Readonly<Record<string, string>>;
}

/** The R2 bucket methods the bucket uses. @experimental */
export interface R2BucketBinding {
  put(
    key: string,
    value: Uint8Array,
    options?: {
      readonly httpMetadata?: { readonly contentType?: string };
      readonly customMetadata?: Readonly<Record<string, string>>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<(R2ObjectHead & { arrayBuffer(): Promise<ArrayBuffer> }) | null>;
  head(key: string): Promise<R2ObjectHead | null>;
  delete(key: string): Promise<void>;
  list(options?: { readonly prefix?: string; readonly cursor?: string }): Promise<{
    readonly objects: readonly R2ObjectHead[];
    readonly truncated: boolean;
    readonly cursor?: string;
  }>;
}

/** A cache provider with the lifecycle the runtime registration exposes. @experimental */
export interface CloudflareKvBindingCacheProvider extends CacheProvider {
  readonly close: () => Promise<void>;
}

/**
 * Creates a cache on a Workers KV binding. Values are canonical JSON; TTLs are at least 60 s, as
 * KV requires, and KV is eventually consistent across locations.
 * @param options - Binding name, the cache's key prefix and an optional binding for tests.
 * @returns The cache provider.
 * @experimental
 */
export function createCloudflareKvBindingCacheProvider(options: {
  readonly binding: string;
  readonly cacheId: string;
  readonly namespace?: KvNamespaceBinding;
}): CloudflareKvBindingCacheProvider {
  let closed = false;
  const kv = (): KvNamespaceBinding => {
    if (closed) throw new Error("Cloudflare KV cache provider is closed");
    return options.namespace ?? workersBinding<KvNamespaceBinding>(options.binding);
  };
  const encoded = (key: unknown): string => {
    const value = `${options.cacheId}:${canonicalJson(key)}`;
    if (new TextEncoder().encode(value).byteLength > 512)
      throw new RangeError("Cloudflare KV key exceeds 512 bytes");
    return value;
  };
  const get = async (key: unknown): Promise<unknown> => {
    const text = await kv().get(encoded(key), "text");
    return text === null ? undefined : JSON.parse(text);
  };
  const set = async (key: unknown, value: unknown, settings?: CacheOperationOptions) => {
    if (settings?.ttlMs !== undefined && settings.ttlMs < 60_000)
      throw new RangeError("Cloudflare KV ttlMs must be at least 60000");
    await kv().put(
      encoded(key),
      canonicalJson(value),
      settings?.ttlMs === undefined ? {} : { expirationTtl: Math.ceil(settings.ttlMs / 1_000) },
    );
  };
  return Object.freeze({
    capabilities: Object.freeze({ increment: false }),
    get,
    set,
    delete: async (key: unknown) => kv().delete(encoded(key)),
    has: async (key: unknown) => (await get(key)) !== undefined,
    getOrSet: async (
      key: unknown,
      produce: () => unknown | Promise<unknown>,
      settings?: CacheOperationOptions,
    ) => {
      const cached = await get(key);
      if (cached !== undefined) return cached;
      const value = await produce();
      await set(key, value, settings);
      return value;
    },
    close: async () => {
      closed = true;
    },
  });
}

/**
 * Creates a bucket on an R2 binding. Bindings cannot sign URLs, so the bucket has no signed URLs.
 * @param options - Binding name and an optional binding for tests.
 * @returns The bucket provider.
 * @experimental
 */
export function createCloudflareR2BindingBucketProvider(options: {
  readonly binding: string;
  readonly bucket?: R2BucketBinding;
}): BucketProvider {
  const r2 = (): R2BucketBinding =>
    options.bucket ?? workersBinding<R2BucketBinding>(options.binding);
  return Object.freeze({
    capabilities: Object.freeze({ signedReadUrl: false, signedWriteUrl: false }),
    put: async (key: string, bytes: Uint8Array, put?: BucketPutOptions) => {
      await r2().put(key, bytes, {
        ...(put?.contentType === undefined
          ? {}
          : { httpMetadata: { contentType: put.contentType } }),
        ...(put?.metadata === undefined ? {} : { customMetadata: put.metadata }),
      });
    },
    get: async (key: string) => {
      const object = await r2().get(key);
      return object === null ? undefined : new Uint8Array(await object.arrayBuffer());
    },
    head: async (key: string) => {
      const object = await r2().head(key);
      return object === null ? undefined : metadata(object);
    },
    delete: async (key: string) => r2().delete(key),
    exists: async (key: string) => (await r2().head(key)) !== null,
    list: async (prefix?: string) => {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await r2().list({
          ...(prefix === undefined ? {} : { prefix }),
          ...(cursor === undefined ? {} : { cursor }),
        });
        keys.push(...page.objects.map((object) => object.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor !== undefined);
      return Object.freeze(keys);
    },
  });
}

/**
 * Projects an R2 object's head onto RelKit's bucket metadata.
 * @param object - Object head from the binding.
 * @returns Bucket metadata.
 */
function metadata(object: R2ObjectHead): BucketObjectMetadata {
  return {
    etag: object.etag.replaceAll('"', ""),
    size: object.size,
    ...(object.httpMetadata?.contentType === undefined
      ? {}
      : { contentType: object.httpMetadata.contentType }),
    metadata: object.customMetadata ?? {},
  };
}
