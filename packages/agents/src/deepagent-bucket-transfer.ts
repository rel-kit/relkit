import type { FileDownloadResponse, FileUploadResponse } from "deepagents";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import { putFileDataEffect } from "./deepagent-bucket-file-data.js";
import { bucketKey, isControlFailure, virtualPath } from "./deepagent-bucket-files.js";
import type { DeepAgentBucketContext } from "./deepagent-bucket-files.types.js";

/** Uploads files in input order so repeated paths retain last-write behavior.
 * @param files - Virtual paths and bytes to store.
 * @returns An Effect with one response per file or a tagged control failure.
 * @example Effect.runPromise(Effect.provide(uploadBucketFilesEffect([["/a", bytes]]), deepAgentBucketLayer(context)));
 */
export const uploadBucketFilesEffect = Effect.fn("Agents.bucket.upload")(
  function* (files: Array<[string, Uint8Array]>) {
    yield* DeepAgentBucket;
    return yield* Effect.forEach(files, ([path, content]) =>
      Effect.gen(function* () {
        const normalized = yield* Effect.try({
          try: () => {
            if (!(content instanceof Uint8Array)) throw new TypeError("File content must be bytes");
            return virtualPath(path);
          },
          catch: deepAgentBucketFailure,
        });
        yield* putFileDataEffect(normalized, content);
        return { path: normalized, error: null } satisfies FileUploadResponse;
      }).pipe(Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure)
          : Effect.succeed({ path, error: "invalid_path" as const }),
      )),
      { concurrency: 1 },
    );
  },
  (effect) => observeAgent("bucket.upload", effect),
);

/** Uploads files for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param files - Virtual paths and bytes to store.
 * @returns One response per file in input order.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await uploadBucketFiles(context, [["/a", bytes]]);
 */
export function uploadBucketFiles(
  context: DeepAgentBucketContext,
  files: Array<[string, Uint8Array]>,
): Promise<FileUploadResponse[]> {
  return Effect.runPromise(uploadBucketFilesEffect(files).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(deepAgentBucketLayer(context)),
  ));
}

/** Downloads files in input order with a result for each path.
 * @param paths - Virtual paths to read.
 * @returns An Effect with one response per path or a tagged control failure.
 * @example Effect.runPromise(Effect.provide(downloadBucketFilesEffect(["/a"]), deepAgentBucketLayer(context)));
 */
export const downloadBucketFilesEffect = Effect.fn("Agents.bucket.download")(
  function* (paths: string[]) {
    const context = yield* DeepAgentBucket;
    return yield* Effect.forEach(paths, (path) =>
      Effect.gen(function* () {
        const key = yield* Effect.try({ try: () => bucketKey(context, path), catch: deepAgentBucketFailure });
        const content = yield* Effect.tryPromise({
          try: () => context.bucket.get(key),
          catch: deepAgentBucketFailure,
        });
        return content === undefined
          ? { path, content: null, error: "file_not_found" as const }
          : { path: virtualPath(path), content, error: null };
      }).pipe(Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure)
          : Effect.succeed({ path, content: null, error: "invalid_path" as const }),
      )),
      { concurrency: 1 },
    );
  },
  (effect) => observeAgent("bucket.download", effect),
);

/** Downloads files for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param paths - Virtual paths to read.
 * @returns One response per path in input order.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await downloadBucketFiles(context, ["/a"]);
 */
export function downloadBucketFiles(
  context: DeepAgentBucketContext,
  paths: string[],
): Promise<FileDownloadResponse[]> {
  return Effect.runPromise(downloadBucketFilesEffect(paths).pipe(
    Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(deepAgentBucketLayer(context)),
  ));
}
