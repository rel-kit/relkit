import type { BucketOperationContext, BucketProvider, BucketPutOptions } from "@zsys/buckets";
import {
  assertResponse,
  presignS3Url,
  signedRequest,
  type S3Credentials,
  type SignedRequestInit,
} from "./signing.js";
import { decodeS3Xml, s3XmlValue } from "./s3-xml.js";
import { endpointFor, objectUrl, requiredText } from "./s3-url.js";

export interface S3BucketOptions {
  readonly endpoint: string;
  readonly bucketName: string;
  readonly region: string;
  readonly credentials?: S3Credentials;
  readonly forcePathStyle?: boolean;
  readonly signedUrlTtlSeconds?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export interface S3BucketProvider extends BucketProvider {
  readonly inspector: {
    readonly list: (request: {
      readonly prefix?: string;
      readonly cursor?: string;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<{ readonly items: readonly unknown[]; readonly nextCursor?: string }>;
    readonly preview: (request: {
      readonly key: string;
      readonly offset: number;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<
      | { readonly bytes: Uint8Array; readonly metadata: unknown; readonly totalBytes: number }
      | undefined
    >;
  };
}
export function createS3BucketProvider(options: S3BucketOptions): S3BucketProvider {
  const endpoint = endpointFor(options.endpoint);
  const bucket = requiredText(options.bucketName, "S3 bucketName");
  const region = requiredText(options.region, "S3 region");
  const forcePathStyle = options.forcePathStyle ?? false;
  const expires = options.signedUrlTtlSeconds ?? 900;
  if (!Number.isSafeInteger(expires) || expires < 1 || expires > 604_800) {
    throw new RangeError("S3 signedUrlTtlSeconds must be between 1 and 604800");
  }
  const url = (key = ""): string => objectUrl(endpoint, bucket, key, forcePathStyle);
  const request = (
    key: string,
    init: SignedRequestInit,
    context?: BucketOperationContext,
  ): Promise<Response> =>
    signedRequest(url(key), {
      region,
      ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      init: { ...init, ...(context === undefined ? {} : { signal: context.signal }) },
    });
  const inspector: S3BucketProvider["inspector"] = Object.freeze({
    list: async (input) => {
      const listUrl = new URL(url());
      listUrl.searchParams.set("list-type", "2");
      listUrl.searchParams.set("max-keys", String(input.limit));
      if (input.prefix !== undefined) listUrl.searchParams.set("prefix", input.prefix);
      if (input.cursor !== undefined) listUrl.searchParams.set("continuation-token", input.cursor);
      const response = await signedRequest(listUrl.toString(), {
        region,
        ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        init: { method: "GET", signal: input.signal },
      });
      await assertResponse(response, "S3 inspector list");
      const xml = await response.text();
      const items = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => ({
        key: decodeS3Xml(s3XmlValue(match[1]!, "Key") ?? ""),
        size: Number(s3XmlValue(match[1]!, "Size") ?? 0),
        etag: (s3XmlValue(match[1]!, "ETag") ?? "").replaceAll('"', ""),
        lastModified: s3XmlValue(match[1]!, "LastModified") ?? undefined,
      }));
      const nextCursor = s3XmlValue(xml, "NextContinuationToken");
      return {
        items,
        ...(nextCursor === undefined ? {} : { nextCursor: decodeS3Xml(nextCursor) }),
      };
    },
    preview: async (input) => {
      const response = await request(
        input.key,
        {
          method: "GET",
          headers: { range: `bytes=${input.offset}-${input.offset + input.limit - 1}` },
        },
        { operation: "get", signal: input.signal },
      );
      if (response.status === 404) return undefined;
      await assertResponse(response, "S3 inspector preview");
      const range = response.headers.get("content-range")?.match(/\/(\d+)$/);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        bytes,
        totalBytes: range === undefined || range === null ? bytes.byteLength : Number(range[1]),
        metadata: {
          contentType: response.headers.get("content-type") ?? "application/octet-stream",
          etag: response.headers.get("etag")?.replaceAll('"', "") ?? "",
        },
      };
    },
  });
  return Object.freeze({
    capabilities: Object.freeze({ signedReadUrl: true, signedWriteUrl: true }),
    put: async (
      key: string,
      bytes: Uint8Array,
      putOptions?: BucketPutOptions,
      context?: BucketOperationContext,
    ) => {
      const headers = new Headers();
      if (putOptions?.contentType !== undefined)
        headers.set("content-type", putOptions.contentType);
      for (const [name, value] of Object.entries(putOptions?.metadata ?? {})) {
        headers.set(`x-amz-meta-${name}`, value);
      }
      await assertResponse(
        await request(key, { method: "PUT", headers, body: bytes }, context),
        "S3 put",
      );
    },
    get: async (key: string, context?: BucketOperationContext) => {
      const response = await request(key, { method: "GET" }, context);
      if (response.status === 404) return undefined;
      await assertResponse(response, "S3 get");
      return new Uint8Array(await response.arrayBuffer());
    },
    head: async (key: string, context?: BucketOperationContext) => {
      const response = await request(key, { method: "HEAD" }, context);
      if (response.status === 404) return undefined;
      await assertResponse(response, "S3 head");
      const metadata: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (name.startsWith("x-amz-meta-")) metadata[name.slice(11)] = value;
      });
      const size = Number(response.headers.get("content-length"));
      return {
        etag: response.headers.get("etag")?.replaceAll('"', "") ?? "",
        ...(response.headers.get("x-amz-checksum-sha256") === null
          ? {}
          : { contentHash: response.headers.get("x-amz-checksum-sha256")! }),
        ...(response.headers.get("content-type") === null
          ? {}
          : { contentType: response.headers.get("content-type")! }),
        ...(Number.isFinite(size) ? { size } : {}),
        metadata,
      };
    },
    delete: async (key: string, context?: BucketOperationContext) => {
      await assertResponse(await request(key, { method: "DELETE" }, context), "S3 delete");
    },
    exists: async (key: string, context?: BucketOperationContext) =>
      (await request(key, { method: "HEAD" }, context)).ok,
    list: async (prefix?: string, context?: BucketOperationContext) => {
      const listUrl = new URL(url());
      listUrl.searchParams.set("list-type", "2");
      if (prefix !== undefined) listUrl.searchParams.set("prefix", prefix);
      const response = await signedRequest(listUrl.toString(), {
        region,
        ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        init: { method: "GET", ...(context === undefined ? {} : { signal: context.signal }) },
      });
      await assertResponse(response, "S3 list");
      return Object.freeze(
        [...(await response.text()).matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) =>
          decodeS3Xml(match[1]!),
        ),
      );
    },
    createReadUrl: (key: string) =>
      presignS3Url(url(key), "GET", region, expires, {
        ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
    createWriteUrl: (key: string) =>
      presignS3Url(url(key), "PUT", region, expires, {
        ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
    inspector,
  });
}
