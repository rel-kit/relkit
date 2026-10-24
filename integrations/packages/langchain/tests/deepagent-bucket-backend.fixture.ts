/** Creates isolated native deepagent bucket backend fixtures; each caller owns the returned model, state and provider observations. */

import { createBucketClient, type BucketProvider, type BucketPutOptions } from "@relkit/buckets";
import { createDeepAgentBucketBackend } from "../src/deepagent-bucket-backend.ts";

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly options?: BucketPutOptions;
}

export function memoryBackend(signal?: () => AbortSignal) {
  const objects = new Map<string, StoredObject>();
  const provider: BucketProvider = {
    put: async (key, bytes, options) => {
      objects.set(key, { bytes: bytes.slice(), ...(options === undefined ? {} : { options }) });
    },
    get: async (key) => objects.get(key)?.bytes.slice(),
    head: async (key) => {
      const object = objects.get(key);
      return object === undefined
        ? undefined
        : {
            etag: key,
            size: object.bytes.byteLength,
            ...(object.options?.contentType === undefined
              ? {}
              : { contentType: object.options.contentType }),
            ...(object.options?.metadata === undefined
              ? {}
              : { metadata: object.options.metadata }),
          };
    },
    delete: async (key) => {
      objects.delete(key);
    },
    exists: async (key) => objects.has(key),
    list: async (prefix) =>
      [...objects.keys()].filter((key) => prefix === undefined || key.startsWith(prefix)).sort(),
  };
  const bucket = createBucketClient({
    ownerId: "assistant",
    bucketId: "workspace",
    source: provider,
    ...(signal === undefined ? {} : { signal }),
  });
  return { backend: createDeepAgentBucketBackend(bucket, { prefix: "threads/demo" }), objects };
}
