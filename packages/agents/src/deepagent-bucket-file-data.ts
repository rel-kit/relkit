import type { DeepAgentBucketFileData, DeepAgentBucketMetadata, DeepAgentBucketContext } from "./deepagent-bucket-files.types.js";
import { Clock, Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import { bucketKey, isTextMimeType } from "./deepagent-bucket-files.js";

/** Reads bytes and metadata together from the current bucket service.
 * @param path - Virtual file path.
 * @returns An Effect with decoded file data, undefined, or DeepAgentBucketFailure.
 * @example Effect.runPromise(Effect.provide(readFileDataEffect("/a.md"), deepAgentBucketLayer(context)));
 */
export const readFileDataEffect = Effect.fn("Agents.bucket.readData")(
  function* (path: string) {
    const context = yield* DeepAgentBucket;
    const key = yield* Effect.try({ try: () => bucketKey(context, path), catch: deepAgentBucketFailure });
    const [bytes, metadata] = yield* Effect.all([
      Effect.tryPromise({ try: () => context.bucket.get(key), catch: deepAgentBucketFailure }),
      Effect.tryPromise({ try: () => context.bucket.head(key), catch: deepAgentBucketFailure }),
    ]);
    if (bytes === undefined) return undefined;
    const mimeType = metadata?.contentType ?? mimeTypeFor(path);
    const content = isTextMimeType(mimeType) ? new TextDecoder().decode(bytes) : bytes;
    return {
      content,
      mimeType,
      created_at: timestamp(metadata, "deepagents-created-at"),
      modified_at: timestamp(metadata, "deepagents-modified-at"),
    } satisfies DeepAgentBucketFileData;
  },
  (effect) => observeAgent("bucket.read-data", effect),
);

/** Reads a file for existing Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual file path.
 * @returns Decoded data or undefined when the file is absent.
 * @throws The original bucket or path failure.
 * @example await readFileData(context, "/a.md");
 */
export function readFileData(context: DeepAgentBucketContext, path: string): Promise<DeepAgentBucketFileData | undefined> {
  return Effect.runPromise(readFileDataEffect(path).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(deepAgentBucketLayer(context)),
  ));
}

/** Writes file content with timestamps from the Effect clock.
 * @param path - Virtual file path.
 * @param content - Text or raw bytes to store.
 * @returns An Effect with void or DeepAgentBucketFailure.
 * @example Effect.runPromise(Effect.provide(putFileDataEffect("/a.md", "hi"), deepAgentBucketLayer(context)));
 */
export const putFileDataEffect = Effect.fn("Agents.bucket.writeData")(
  function* (path: string, content: string | Uint8Array) {
    const context = yield* DeepAgentBucket;
    const key = yield* Effect.try({ try: () => bucketKey(context, path), catch: deepAgentBucketFailure });
    const previous = yield* Effect.tryPromise({
      try: () => context.bucket.head(key),
      catch: deepAgentBucketFailure,
    });
    const now = new Date(yield* Clock.currentTimeMillis).toISOString();
    const mimeType = mimeTypeFor(path);
    const bytes = yield* Effect.try({
      try: () => typeof content === "string" ? encodeContent(content, mimeType) : content,
      catch: deepAgentBucketFailure,
    });
    yield* Effect.tryPromise({
      try: () => context.bucket.put(key, bytes, {
        contentType: mimeType,
        metadata: {
          "deepagents-created-at": timestamp(previous, "deepagents-created-at", now),
          "deepagents-modified-at": now,
        },
      }),
      catch: deepAgentBucketFailure,
    });
  },
  (effect) => observeAgent("bucket.write-data", effect),
);

/** Writes a file for existing Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual file path.
 * @param content - Text or raw bytes to store.
 * @returns A Promise that resolves when the bucket accepts the content.
 * @throws The original bucket or path failure.
 * @example await putFileData(context, "/a.md", "hi");
 */
export function putFileData(context: DeepAgentBucketContext, path: string, content: string | Uint8Array): Promise<void> {
  return Effect.runPromise(putFileDataEffect(path, content).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(deepAgentBucketLayer(context)),
  ));
}

function encodeContent(content: string, mimeType: string): Uint8Array {
  if (isTextMimeType(mimeType)) return new TextEncoder().encode(content);
  const payload = content.trim().startsWith("data:")
    ? content.slice(content.indexOf(",") + 1)
    : content;
  return Uint8Array.fromBase64(payload.replaceAll(/\s/g, ""));
}

function timestamp(metadata: DeepAgentBucketMetadata | undefined, key: string, fallback = new Date(0).toISOString()): string {
  return metadata?.metadata?.[key] ?? fallback;
}

function mimeTypeFor(path: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)) {
    return `image/${extension === ".jpg" ? "jpeg" : extension.slice(1)}`;
  }
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".json") return "application/json";
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return "application/javascript";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  return "text/plain";
}
