import type { BucketProvider, BucketPutOptions } from "@zsys/buckets";
import { assertResponse, awsRequest } from "./http.js";
import { credentials, text } from "./config.js";

export interface AwsBucketOptions {
  readonly region: string;
  readonly bucketName?: unknown;
  readonly endpoint?: unknown;
  readonly values?: Readonly<Record<string, unknown>> | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export function createS3BucketProvider(options: AwsBucketOptions): BucketProvider {
  const bucket = text(options.bucketName, "AWS bucketName");
  const endpoint = endpointFor(options.endpoint, options.region);
  const auth = credentials(options.values);
  const url = (key = ""): string => `${endpoint}/${bucket}${key === "" ? "" : `/${keyPath(key)}`}`;
  const request = (key: string, init: import("./http.js").AwsRequestInit): Promise<Response> =>
    awsRequest(url(key), {
      service: "s3",
      region: options.region,
      credentials: auth,
      fetch: options.fetch,
      init,
    });
  return Object.freeze({
    capabilities: Object.freeze({ signedReadUrl: false, signedWriteUrl: false }),
    put: async (key: string, bytes: Uint8Array, putOptions?: BucketPutOptions) => {
      const headers = new Headers();
      if (typeof putOptions?.contentType === "string")
        headers.set("content-type", putOptions.contentType);
      for (const [name, value] of Object.entries(putOptions?.metadata ?? {}))
        headers.set(`x-amz-meta-${name}`, value);
      await assertResponse(await request(key, { method: "PUT", headers, body: bytes }), "S3 put");
    },
    get: async (key: string) => {
      const response = await request(key, { method: "GET" });
      if (response.status === 404) return undefined;
      await assertResponse(response, "S3 get");
      return new Uint8Array(await response.arrayBuffer());
    },
    head: async (key: string) => {
      const response = await request(key, { method: "HEAD" });
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
    delete: async (key: string) => {
      await assertResponse(await request(key, { method: "DELETE" }), "S3 delete");
    },
    exists: async (key: string) => (await request(key, { method: "HEAD" })).ok,
    list: async (prefix?: string) => {
      const query =
        prefix === undefined ? "?list-type=2" : `?list-type=2&prefix=${encodeURIComponent(prefix)}`;
      const response = await awsRequest(`${url()}${query}`, {
        service: "s3",
        region: options.region,
        credentials: auth,
        fetch: options.fetch,
        init: { method: "GET" },
      });
      await assertResponse(response, "S3 list");
      const xml = await response.text();
      return Object.freeze(
        [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) => decodeXml(match[1]!)),
      );
    },
  });
}

function endpointFor(value: unknown, region: string): string {
  const endpoint = text(value, "AWS S3 endpoint") ?? `https://s3.${region}.amazonaws.com`;
  return endpoint.replace(/\/$/, "");
}

function keyPath(value: string): string {
  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeXml(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
