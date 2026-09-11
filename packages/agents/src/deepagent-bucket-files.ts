import type { FileData, FileInfo } from "deepagents";

const TEXT_MIME_TYPES = new Set(["application/javascript", "application/json", "image/svg+xml"]);

export interface DeepAgentBucketContext {
  readonly bucket: DeepAgentBucketClient;
  readonly prefix: string;
}

export interface DeepAgentBucketMetadata {
  readonly contentType?: string;
  readonly size?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type DeepAgentBucketFileData = Extract<FileData, { readonly mimeType: string }>;

export interface DeepAgentBucketClient {
  readonly put: (
    key: string,
    bytes: Uint8Array,
    options?: {
      readonly contentType?: string;
      readonly metadata?: Readonly<Record<string, string>>;
    },
  ) => Promise<void>;
  readonly get: (key: string) => Promise<Uint8Array | undefined>;
  readonly head: (key: string) => Promise<DeepAgentBucketMetadata | undefined>;
  readonly delete: (key: string) => Promise<void>;
  readonly exists: (key: string) => Promise<boolean>;
  readonly list: (prefix?: string) => Promise<readonly string[]>;
}
export function createBucketContext(
  bucket: DeepAgentBucketClient,
  prefix = "deepagents",
): DeepAgentBucketContext {
  assertBucketClient(bucket);
  const normalized = normalizeKeyPrefix(prefix);
  return Object.freeze({ bucket, prefix: normalized });
}

export function virtualPath(value: string, directory = false): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error("Path cannot be empty");
  if (value.includes("\0") || value.startsWith("~") || /^[A-Za-z]:/.test(value)) {
    throw new Error(`Invalid virtual path: ${value}`);
  }
  const parts = value.replaceAll("\\", "/").split("/");
  if (parts.includes("..")) throw new Error(`Path traversal not allowed: ${value}`);
  const clean = parts.filter((part) => part !== "" && part !== ".");
  if (!directory && clean.length === 0) throw new Error("File path cannot be root");
  return `/${clean.join("/")}${directory && clean.length > 0 ? "/" : ""}`;
}

export function bucketKey(context: DeepAgentBucketContext, path: string): string {
  return `${context.prefix}/${virtualPath(path).slice(1)}`;
}

export function filePath(context: DeepAgentBucketContext, key: string): string {
  const prefix = `${context.prefix}/`;
  if (!key.startsWith(prefix)) throw new Error("Bucket key is outside the backend prefix");
  return `/${key.slice(prefix.length)}`;
}

export async function readFileData(
  context: DeepAgentBucketContext,
  path: string,
): Promise<DeepAgentBucketFileData | undefined> {
  const key = bucketKey(context, path);
  const [bytes, metadata] = await Promise.all([context.bucket.get(key), context.bucket.head(key)]);
  if (bytes === undefined) return undefined;
  const mimeType = metadata?.contentType ?? mimeTypeFor(path);
  const content = isTextMimeType(mimeType) ? new TextDecoder().decode(bytes) : bytes;
  return {
    content,
    mimeType,
    created_at: timestamp(metadata, "deepagents-created-at"),
    modified_at: timestamp(metadata, "deepagents-modified-at"),
  };
}

export async function putFileData(
  context: DeepAgentBucketContext,
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  const key = bucketKey(context, path);
  const previous = await context.bucket.head(key);
  const now = new Date().toISOString();
  const mimeType = mimeTypeFor(path);
  const bytes = typeof content === "string" ? encodeContent(content, mimeType) : content;
  await context.bucket.put(key, bytes, {
    contentType: mimeType,
    metadata: {
      "deepagents-created-at": timestamp(previous, "deepagents-created-at", now),
      "deepagents-modified-at": now,
    },
  });
}

export async function scopedKeys(
  context: DeepAgentBucketContext,
  path: string | null | undefined,
): Promise<readonly string[]> {
  const base = virtualPath(path ?? "/", true);
  if (base !== "/") {
    const exact = base.slice(0, -1);
    if (await context.bucket.exists(bucketKey(context, exact))) return [bucketKey(context, exact)];
  }
  const prefix = base === "/" ? `${context.prefix}/` : `${context.prefix}${base}`;
  return [...(await context.bucket.list(prefix))].sort();
}

export async function infoFor(
  context: DeepAgentBucketContext,
  key: string,
): Promise<FileInfo | undefined> {
  const metadata = await context.bucket.head(key);
  if (metadata === undefined) return undefined;
  return {
    path: filePath(context, key),
    is_dir: false,
    ...(metadata.size === undefined ? {} : { size: metadata.size }),
    modified_at: timestamp(metadata, "deepagents-modified-at"),
  };
}

export function normalizedPage(offset = 0, limit = 500): { offset: number; limit: number } {
  return {
    offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
    limit: Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0,
  };
}

export function isControlFailure(cause: unknown): boolean {
  const value = cause as { readonly name?: unknown; readonly code?: unknown };
  return (
    value?.name === "AbortError" ||
    value?.name === "TimeoutError" ||
    value?.code === "ABORT_ERR" ||
    value?.code === "ETIMEDOUT"
  );
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith("text/") || TEXT_MIME_TYPES.has(mimeType);
}

function encodeContent(content: string, mimeType: string): Uint8Array {
  if (isTextMimeType(mimeType)) return new TextEncoder().encode(content);
  const payload = content.trim().startsWith("data:")
    ? content.slice(content.indexOf(",") + 1)
    : content;
  return Uint8Array.fromBase64(payload.replaceAll(/\s/g, ""));
}

function normalizeKeyPrefix(value: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError("Backend prefix is required");
  const normalized = virtualPath(value).slice(1);
  if (normalized.startsWith(".relkit") || normalized.startsWith("__relkit")) {
    throw new TypeError("Backend prefix is reserved");
  }
  return normalized;
}

function assertBucketClient(value: DeepAgentBucketClient): void {
  const client = value as unknown as Record<string, unknown>;
  for (const operation of ["put", "get", "head", "delete", "exists", "list"] as const) {
    if (typeof client?.[operation] !== "function") {
      throw new TypeError("DeepAgents bucket backend requires a RELKIT BucketClient");
    }
  }
}

function timestamp(
  metadata: DeepAgentBucketMetadata | undefined,
  key: string,
  fallback = new Date(0).toISOString(),
): string {
  return metadata?.metadata?.[key] ?? fallback;
}

function mimeTypeFor(path: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)) {
    return `image/${extension === ".jpg" ? "jpeg" : extension.slice(1)}`;
  }
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".json") return "application/json";
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return "application/javascript";
  }
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  return "text/plain";
}
