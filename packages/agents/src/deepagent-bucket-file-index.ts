import type { FileInfo } from "deepagents";
import type { DeepAgentBucketContext, DeepAgentBucketMetadata } from "./deepagent-bucket-files.types.js";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import { bucketKey, filePath, virtualPath } from "./deepagent-bucket-files.js";

/** Lists sorted keys in a virtual file or directory.
 * @param path - Virtual path, or null for the backend root.
 * @returns An Effect with ordered keys or DeepAgentBucketFailure.
 * @example Effect.runPromise(Effect.provide(scopedKeysEffect("/notes"), deepAgentBucketLayer(context)));
 */
export const scopedKeysEffect = Effect.fn("Agents.bucket.scopedKeys")(
  function* (path: string | null | undefined) {
    const context = yield* DeepAgentBucket;
    const base = yield* Effect.try({
      try: () => virtualPath(path ?? "/", true),
      catch: deepAgentBucketFailure,
    });
    if (base !== "/") {
      const exact = bucketKey(context, base.slice(0, -1));
      const exists = yield* Effect.tryPromise({
        try: () => context.bucket.exists(exact),
        catch: deepAgentBucketFailure,
      });
      if (exists) return [exact];
    }
    const prefix = base === "/" ? `${context.prefix}/` : `${context.prefix}${base}`;
    const keys = yield* Effect.tryPromise({
      try: () => context.bucket.list(prefix),
      catch: deepAgentBucketFailure,
    });
    return [...keys].sort();
  },
  (effect) => observeAgent("bucket.scoped-keys", effect),
);

/** Lists keys for existing Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual path, or null for the backend root.
 * @returns Ordered keys.
 * @throws The original bucket or path failure.
 * @example await scopedKeys(context, "/notes");
 */
export function scopedKeys(context: DeepAgentBucketContext, path: string | null | undefined): Promise<readonly string[]> {
  return Effect.runPromise(scopedKeysEffect(path).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(deepAgentBucketLayer(context)),
  ));
}

/** Reads metadata for one bucket key.
 * @param key - Bucket key under the current prefix.
 * @returns An Effect with file info, undefined, or DeepAgentBucketFailure.
 * @example Effect.runPromise(Effect.provide(infoForEffect("deepagents/a.md"), deepAgentBucketLayer(context)));
 */
export const infoForEffect = Effect.fn("Agents.bucket.info")(
  function* (key: string) {
    const context = yield* DeepAgentBucket;
    const metadata = yield* Effect.tryPromise({
      try: () => context.bucket.head(key),
      catch: deepAgentBucketFailure,
    });
    if (metadata === undefined) return undefined;
    const path = yield* Effect.try({ try: () => filePath(context, key), catch: deepAgentBucketFailure });
    const info: FileInfo = {
      path,
      is_dir: false,
      ...(metadata.size === undefined ? {} : { size: metadata.size }),
      modified_at: timestamp(metadata, "deepagents-modified-at"),
    };
    return info;
  },
  (effect) => observeAgent("bucket.info", effect),
);

/** Reads metadata for existing Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param key - Bucket key under the current prefix.
 * @returns File info or undefined.
 * @throws The original bucket or path failure.
 * @example await infoFor(context, "deepagents/a.md");
 */
export function infoFor(context: DeepAgentBucketContext, key: string): Promise<FileInfo | undefined> {
  return Effect.runPromise(infoForEffect(key).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(deepAgentBucketLayer(context)),
  ));
}

function timestamp(metadata: DeepAgentBucketMetadata, key: string): string {
  return metadata.metadata?.[key] ?? new Date(0).toISOString();
}
