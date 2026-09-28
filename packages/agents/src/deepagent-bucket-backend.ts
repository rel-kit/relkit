import type { BackendProtocolV2 } from "deepagents";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { createBucketContext, type DeepAgentBucketClient } from "./deepagent-bucket-files.js";
import { readBucket, readBucketRaw } from "./deepagent-bucket-read.js";
import { writeBucket, editBucket } from "./deepagent-bucket-write.js";
import { uploadBucketFiles, downloadBucketFiles } from "./deepagent-bucket-transfer.js";
import { listDirectory } from "./deepagent-bucket-search.js";
import { globFiles } from "./deepagent-bucket-glob.js";
import { grepFiles } from "./deepagent-bucket-grep.js";
import { removeBucketPath } from "./deepagent-bucket-delete.js";

import type { DeepAgentBucketBackendOptions } from "./deepagent-bucket-backend.types.js";

export type { DeepAgentBucketBackendOptions } from "./deepagent-bucket-backend.types.js";

/** Builds a DeepAgents backend from a RELKIT bucket client.
 * @param bucket - Bucket client that owns the backend's files.
 * @param options - Optional key prefix.
 * @returns An Effect with a frozen backend or DeepAgentBucketFailure.
 * @example Effect.runSync(createDeepAgentBucketBackendEffect(bucket));
 */
export const createDeepAgentBucketBackendEffect = Effect.fn("Agents.bucket.create")(
  function* (bucket: DeepAgentBucketClient, options: DeepAgentBucketBackendOptions = {}) {
    const context = yield* Effect.try({
      try: () => createBucketContext(bucket, options.prefix),
      catch: deepAgentBucketFailure,
    });
    return Object.freeze({
      ls: (path: string) => listDirectory(context, path),
      read: (path: string, offset?: number, limit?: number) =>
        readBucket(context, path, offset, limit),
      readRaw: (path: string) => readBucketRaw(context, path),
      write: (path: string, content: string) => writeBucket(context, path, content),
      edit: (path: string, oldText: string, newText: string, replaceAll = false) =>
        editBucket(context, path, oldText, newText, replaceAll),
      grep: (
        pattern: string,
        path?: string | null,
        glob?: string | null,
        maxCount?: number | null,
      ) => grepFiles(context, pattern, path, glob, maxCount),
      glob: (pattern: string, path?: string) => globFiles(context, pattern, path),
      delete: (path: string) => removeBucketPath(context, path),
      uploadFiles: (files: Array<[string, Uint8Array]>) => uploadBucketFiles(context, files),
      downloadFiles: (paths: string[]) => downloadBucketFiles(context, paths),
    }) satisfies BackendProtocolV2;
  },
  (effect) => observeAgent("bucket.create", effect),
);

/** Creates a backend for existing synchronous callers.
 * @param bucket - Bucket client that owns the backend's files.
 * @param options - Optional key prefix.
 * @returns A frozen DeepAgents backend.
 * @throws The original invalid bucket or prefix error.
 * @example const backend = createDeepAgentBucketBackend(bucket);
 */
export function createDeepAgentBucketBackend(
  bucket: DeepAgentBucketClient,
  options: DeepAgentBucketBackendOptions = {},
): BackendProtocolV2 {
  return Effect.runSync(
    createDeepAgentBucketBackendEffect(bucket, options).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
