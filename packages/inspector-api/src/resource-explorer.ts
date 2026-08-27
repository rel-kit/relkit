import type { JsonValue, MaybePromise } from "@relkit/contracts";
import { InspectorEndpointError } from "./router-utils.js";
import { identity, isRecord, safeJson, type ResolvedActiveGeneration } from "./shared.js";

export interface InspectorBucketExplorer {
  readonly supports: (bucketId: string) => MaybePromise<boolean>;
  readonly list: (request: {
    readonly bucketId: string;
    readonly prefix?: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<{ readonly items: readonly unknown[]; readonly nextCursor?: string }>;
  readonly preview: (request: {
    readonly bucketId: string;
    readonly key: string;
    readonly offset: number;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<
    | { readonly bytes: Uint8Array; readonly metadata?: unknown; readonly totalBytes?: number }
    | undefined
  >;
}

export interface InspectorCacheExplorer {
  readonly supports: (cacheId: string) => MaybePromise<boolean>;
  readonly scan: (request: {
    readonly cacheId: string;
    readonly search?: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<{ readonly items: readonly unknown[]; readonly nextCursor?: string }>;
  readonly value: (request: {
    readonly cacheId: string;
    readonly key: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<unknown | undefined>;
}

export interface InspectorResourceExplorers {
  readonly buckets?: InspectorBucketExplorer;
  readonly cache?: InspectorCacheExplorer;
}

export async function bucketObjects(
  generation: ResolvedActiveGeneration,
  bucketId: string,
  request: Request,
): Promise<JsonValue> {
  const explorer = generation.resources?.buckets;
  if (explorer === undefined || !(await explorer.supports(bucketId)))
    return unsupported(generation);
  const query = queryFor(request);
  const result = await explorer.list({ bucketId, ...query, signal: request.signal });
  return safeJson({ ...identity(generation), supported: true, ...result });
}

export async function bucketPreview(
  generation: ResolvedActiveGeneration,
  bucketId: string,
  request: Request,
  maximumBytes: number,
): Promise<JsonValue> {
  const explorer = generation.resources?.buckets;
  if (explorer === undefined || !(await explorer.supports(bucketId)))
    return unsupported(generation);
  const params = new URL(request.url).searchParams;
  const key = requiredText(params.get("key"), "key", 1_024);
  const offset = integer(params.get("offset"), "offset", 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(params.get("limit"), "limit", maximumBytes, maximumBytes);
  const result = await explorer.preview({ bucketId, key, offset, limit, signal: request.signal });
  if (result === undefined) throw new InspectorEndpointError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  const metadata = safeJson(result.metadata ?? {});
  const contentType = mediaType(metadata);
  const totalBytes = result.totalBytes ?? result.bytes.byteLength;
  return {
    ...identity(generation),
    supported: true,
    key,
    metadata,
    totalBytes,
    truncated: offset + result.bytes.byteLength < totalBytes,
    ...previewContent(result.bytes, contentType),
  } as JsonValue;
}

export async function cacheKeys(
  generation: ResolvedActiveGeneration,
  cacheId: string,
  request: Request,
): Promise<JsonValue> {
  const explorer = generation.resources?.cache;
  if (explorer === undefined || !(await explorer.supports(cacheId))) return unsupported(generation);
  const query = queryFor(request);
  const result = await explorer.scan({ cacheId, ...query, signal: request.signal });
  return safeJson({ ...identity(generation), supported: true, ...result });
}

export async function cacheValue(
  generation: ResolvedActiveGeneration,
  cacheId: string,
  request: Request,
  maximumBytes: number,
): Promise<JsonValue> {
  const explorer = generation.resources?.cache;
  if (explorer === undefined || !(await explorer.supports(cacheId))) return unsupported(generation);
  const params = new URL(request.url).searchParams;
  const key = requiredText(params.get("key"), "key", 2_048);
  const limit = integer(params.get("limit"), "limit", maximumBytes, maximumBytes);
  const result = await explorer.value({ cacheId, key, limit, signal: request.signal });
  if (result === undefined) throw new InspectorEndpointError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  const projected = safeJson(result);
  return {
    ...identity(generation),
    supported: true,
    ...(isRecord(projected) ? projected : {}),
    ...(isRecord(result) && "value" in result ? { value: safeJson(result.value) } : {}),
  } as JsonValue;
}

function queryFor(request: Request) {
  const params = new URL(request.url).searchParams;
  const prefix = optionalText(params.get("prefix"), "prefix", 1_024);
  const search = optionalText(params.get("search"), "search", 256);
  const cursor = optionalText(params.get("cursor"), "cursor", 512);
  const limit = integer(params.get("limit"), "limit", 50, 200);
  return {
    limit,
    ...(prefix === undefined ? {} : { prefix }),
    ...(search === undefined ? {} : { search }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function previewContent(bytes: Uint8Array, contentType: string) {
  if (contentType === "text/html" || contentType === "image/svg+xml") {
    return { kind: "metadata-only" };
  }
  if (contentType === "application/json" || contentType.startsWith("text/")) {
    return {
      kind: contentType === "application/json" ? "json" : "text",
      content: new TextDecoder().decode(bytes),
    };
  }
  if (contentType === "application/pdf" || /^image\/(png|jpeg|gif|webp)$/.test(contentType)) {
    return {
      kind: contentType === "application/pdf" ? "pdf" : "image",
      content: Buffer.from(bytes).toString("base64"),
    };
  }
  return { kind: "metadata-only" };
}

function mediaType(value: JsonValue): string {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "contentType" in value &&
    typeof value.contentType === "string"
    ? value.contentType.split(";", 1)[0]!.toLowerCase()
    : "application/octet-stream";
}

function unsupported(generation: ResolvedActiveGeneration): JsonValue {
  return { ...identity(generation), supported: false, reason: "unsupported", items: [] };
}

function optionalText(value: string | null, name: string, max: number): string | undefined {
  return value === null || value === "" ? undefined : requiredText(value, name, max);
}

function requiredText(value: string | null, name: string, max: number): string {
  if (value === null || value === "" || value.length > max)
    throw new InspectorEndpointError(`RELKIT_INSPECTOR_${name.toUpperCase()}_INVALID`, 400);
  return value;
}

function integer(value: string | null, name: string, fallback: number, max: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) > max)
    throw new InspectorEndpointError(`RELKIT_INSPECTOR_${name.toUpperCase()}_INVALID`, 400);
  return Number(value);
}
