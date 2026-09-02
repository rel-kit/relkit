import type { BucketOperationContext, BucketProvider, BucketPutOptions } from "@relkit/buckets";
import {
  assertR2Response,
  presignR2Url,
  signedR2Request,
  type R2Credentials,
  type R2RequestInit,
} from "./r2-signing.js";

export interface CloudflareR2BucketOptions extends R2Credentials {
  readonly accountId: string;
  readonly bucketName: string;
  readonly signedUrlTtlSeconds?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function createCloudflareR2BucketProvider(
  options: CloudflareR2BucketOptions,
): BucketProvider {
  const accountId = required(options.accountId, "accountId");
  const bucket = required(options.bucketName, "bucketName");
  const credentials = {
    accessKeyId: required(options.accessKeyId, "accessKeyId"),
    secretAccessKey: required(options.secretAccessKey, "secretAccessKey"),
  };
  const expires = options.signedUrlTtlSeconds ?? 900;
  if (!Number.isSafeInteger(expires) || expires < 1 || expires > 604_800)
    throw new RangeError("Cloudflare R2 signedUrlTtlSeconds must be between 1 and 604800");
  const root = `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}`;
  const url = (key = ""): string => `${root}${key === "" ? "/" : `/${keyPath(key)}`}`;
  const request = (
    key: string,
    init: R2RequestInit,
    context?: BucketOperationContext,
  ): Promise<Response> =>
    signedR2Request(
      url(key),
      credentials,
      { ...init, ...(context === undefined ? {} : { signal: context.signal }) },
      options.fetch,
    );
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
      for (const [name, value] of Object.entries(putOptions?.metadata ?? {}))
        headers.set(`x-amz-meta-${name}`, value);
      await assertR2Response(
        await request(key, { method: "PUT", headers, body: bytes }, context),
        "Cloudflare R2 put",
      );
    },
    get: async (key: string, context?: BucketOperationContext) => {
      const response = await request(key, { method: "GET" }, context);
      if (response.status === 404) return undefined;
      await assertR2Response(response, "Cloudflare R2 get");
      return new Uint8Array(await response.arrayBuffer());
    },
    head: async (key: string, context?: BucketOperationContext) => {
      const response = await request(key, { method: "HEAD" }, context);
      if (response.status === 404) return undefined;
      await assertR2Response(response, "Cloudflare R2 head");
      const metadata: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (name.startsWith("x-amz-meta-")) metadata[name.slice(11)] = value;
      });
      const size = Number(response.headers.get("content-length"));
      return {
        etag: response.headers.get("etag")?.replaceAll('"', "") ?? "",
        ...(response.headers.get("content-type") === null
          ? {}
          : { contentType: response.headers.get("content-type")! }),
        ...(Number.isFinite(size) ? { size } : {}),
        metadata,
      };
    },
    delete: async (key: string, context?: BucketOperationContext) => {
      await assertR2Response(
        await request(key, { method: "DELETE" }, context),
        "Cloudflare R2 delete",
      );
    },
    exists: async (key: string, context?: BucketOperationContext) => {
      const response = await request(key, { method: "HEAD" }, context);
      if (response.status === 404) return false;
      await assertR2Response(response, "Cloudflare R2 exists");
      return true;
    },
    list: async (prefix?: string, context?: BucketOperationContext) => {
      const listUrl = new URL(url());
      listUrl.searchParams.set("list-type", "2");
      if (prefix !== undefined) listUrl.searchParams.set("prefix", prefix);
      const response = await signedR2Request(
        listUrl.toString(),
        credentials,
        { method: "GET", ...(context === undefined ? {} : { signal: context.signal }) },
        options.fetch,
      );
      await assertR2Response(response, "Cloudflare R2 list");
      return Object.freeze(
        [...(await response.text()).matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) =>
          decodeXml(match[1]!),
        ),
      );
    },
    createReadUrl: (key: string) => presignR2Url(url(key), "GET", credentials, expires),
    createWriteUrl: (key: string) => presignR2Url(url(key), "PUT", credentials, expires),
  });
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`Cloudflare R2 ${name} is invalid`);
  return value.trim();
}

function keyPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function decodeXml(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
