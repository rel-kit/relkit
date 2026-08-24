import type { BucketOperationContext, BucketProvider, BucketPutOptions } from "@zsys/buckets";
import {
  assertResponse,
  presignS3Url,
  signedRequest,
  type S3Credentials,
  type SignedRequestInit,
} from "./signing.js";

export interface S3BucketOptions {
  readonly endpoint: string;
  readonly bucketName: string;
  readonly region: string;
  readonly credentials?: S3Credentials;
  readonly forcePathStyle?: boolean;
  readonly signedUrlTtlSeconds?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function createS3BucketProvider(options: S3BucketOptions): BucketProvider {
  const endpoint = endpointFor(options.endpoint);
  const bucket = text(options.bucketName, "S3 bucketName");
  const region = text(options.region, "S3 region");
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
          decodeXml(match[1]!),
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
  });
}

function objectUrl(endpoint: string, bucket: string, key: string, pathStyle: boolean): string {
  const parsed = new URL(endpoint);
  const keySuffix = key === "" ? "" : `/${keyPath(key)}`;
  if (pathStyle) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/${encodeURIComponent(bucket)}${keySuffix}`;
  } else {
    parsed.hostname = `${bucket}.${parsed.hostname}`;
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}${keySuffix || "/"}`;
  }
  return parsed.toString().replace(/\/$/, key === "" ? "/" : "");
}

function endpointFor(value: string): string {
  const endpoint = text(value, "S3 endpoint");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("S3 endpoint must use http or https");
  }
  return parsed.toString().replace(/\/$/, "");
}

function keyPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function decodeXml(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value.trim();
}
