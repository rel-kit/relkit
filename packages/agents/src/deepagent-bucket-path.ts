import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import type { DeepAgentBucketClient, DeepAgentBucketContext } from "./deepagent-bucket-files.types.js";

/** Validates a bucket client and creates its private prefix context.
 * @param bucket - RELKIT bucket client.
 * @param prefix - Backend prefix.
 * @returns An Effect with context or DeepAgentBucketFailure.
 * @example Effect.runSync(createBucketContextEffect(bucket));
 */
export const createBucketContextEffect = Effect.fn("Agents.bucket.context")((
  bucket: DeepAgentBucketClient, prefix = "deepagents",
) => Effect.try({ try: () => {
  assertBucketClient(bucket);
  return Object.freeze({ bucket, prefix: normalizeKeyPrefix(prefix) });
}, catch: deepAgentBucketFailure }), (effect) => observeAgent("bucket.context", effect));

/** Creates a bucket context for existing synchronous callers.
 * @param bucket - RELKIT bucket client.
 * @param prefix - Backend prefix.
 * @returns Frozen bucket context.
 * @throws The original invalid bucket or prefix error.
 * @example createBucketContext(bucket, "agents");
 */
export function createBucketContext(bucket: DeepAgentBucketClient, prefix = "deepagents"): DeepAgentBucketContext {
  return Effect.runSync(createBucketContextEffect(bucket, prefix).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Normalizes a virtual backend path and rejects traversal.
 * @param value - Candidate virtual path.
 * @param directory - Whether to retain a trailing slash.
 * @returns An Effect with a normalized path or DeepAgentBucketFailure.
 * @example Effect.runSync(virtualPathEffect("/docs/readme.md"));
 */
export const virtualPathEffect = Effect.fn("Agents.bucket.virtualPath")((
  value: string, directory = false,
) => Effect.try({ try: () => virtualPathCore(value, directory), catch: deepAgentBucketFailure }),
  (effect) => observeAgent("bucket.virtual-path", effect));

/** Normalizes a virtual path for existing synchronous callers.
 * @param value - Candidate virtual path.
 * @param directory - Whether to retain a trailing slash.
 * @returns Normalized absolute virtual path.
 * @throws Error for empty, unsafe, or traversing paths.
 * @example virtualPath("docs/readme.md");
 */
export function virtualPath(value: string, directory = false): string {
  return Effect.runSync(virtualPathEffect(value, directory).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function virtualPathCore(value: string, directory = false): string {
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

/** Converts a virtual path to its bucket key.
 * @param context - Private bucket context.
 * @param path - Virtual file path.
 * @returns An Effect with a bucket key or DeepAgentBucketFailure.
 * @example Effect.runSync(bucketKeyEffect(context, "/readme.md"));
 */
export const bucketKeyEffect = Effect.fn("Agents.bucket.key")((
  context: DeepAgentBucketContext, path: string,
) => Effect.try({ try: () => `${context.prefix}/${virtualPathCore(path).slice(1)}`, catch: deepAgentBucketFailure }),
  (effect) => observeAgent("bucket.key", effect));

/** Converts a virtual path to a bucket key for synchronous callers.
 * @param context - Private bucket context.
 * @param path - Virtual file path.
 * @returns Prefixed bucket key.
 * @throws The original invalid path error.
 * @example bucketKey(context, "/readme.md");
 */
export function bucketKey(context: DeepAgentBucketContext, path: string): string {
  return Effect.runSync(bucketKeyEffect(context, path).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Converts a scoped bucket key to a virtual path.
 * @param context - Private bucket context.
 * @param key - Bucket key.
 * @returns An Effect with a virtual path or DeepAgentBucketFailure.
 * @example Effect.runSync(filePathEffect(context, "agents/readme.md"));
 */
export const filePathEffect = Effect.fn("Agents.bucket.filePath")((
  context: DeepAgentBucketContext, key: string,
) => Effect.try({ try: () => {
  const prefix = `${context.prefix}/`;
  if (!key.startsWith(prefix)) throw new Error("Bucket key is outside the backend prefix");
  return `/${key.slice(prefix.length)}`;
}, catch: deepAgentBucketFailure }), (effect) => observeAgent("bucket.file-path", effect));

/** Converts a scoped bucket key for existing synchronous callers.
 * @param context - Private bucket context.
 * @param key - Bucket key.
 * @returns Virtual file path.
 * @throws Error for a key outside the context prefix.
 * @example filePath(context, "agents/readme.md");
 */
export function filePath(context: DeepAgentBucketContext, key: string): string {
  return Effect.runSync(filePathEffect(context, key).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function normalizeKeyPrefix(value: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError("Backend prefix is required");
  const normalized = virtualPathCore(value).slice(1);
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
