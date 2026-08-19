import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  createBucketClient,
  type BucketClient,
  type BucketObjectMetadata,
  type BucketOperationContext,
  type BucketProvider,
  type BucketPutOptions,
} from "@zsys/buckets";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { createFakeRoot, noFailures, text } from "./fake-utils.js";
import type { TestBucketFake, TestBucketFakeOptions, TestBucketObject } from "./buckets-types.js";

export type { TestBucketFake, TestBucketFakeOptions, TestBucketObject } from "./buckets-types.js";

/** Creates an in-memory bucket provider behind the production Promise client. */
export function createTestBucketFake(options: TestBucketFakeOptions = {}): TestBucketFake {
  const bucketId = text(options.bucketId ?? "test-bucket", "bucketId");
  const ownerId = text(options.ownerId ?? "test", "ownerId");
  const rootOwner = createFakeRoot(options.stateRoot, "buckets", bucketId);
  const stateRoot = rootOwner.stateRoot;
  const failures = options.failures ?? noFailures;
  const clock = options.clock ?? Date.now;
  const maxObjectBytes = options.maxObjectBytes;
  if (
    maxObjectBytes !== undefined &&
    (!Number.isSafeInteger(maxObjectBytes) || maxObjectBytes <= 0)
  ) {
    throw new TypeError("maxObjectBytes must be a positive safe integer");
  }
  const allowedContentTypes = options.allowedContentTypes?.map((value) =>
    text(value, "contentType"),
  );
  const entries = new Map<string, TestBucketObject>();
  let closed = false;

  const provider = Object.freeze<BucketProvider>({
    capabilities: { signedReadUrl: false, signedWriteUrl: false },
    put: (key, bytes, putOptions, context) => write(key, bytes, putOptions, context),
    get: async (key, context) => {
      open();
      assertKey(key);
      assertActive(context, clock);
      const entry = entries.get(key);
      return entry === undefined ? undefined : new Uint8Array(entry.bytes);
    },
    head: async (key, context) => {
      open();
      assertKey(key);
      assertActive(context, clock);
      return copyMetadata(entries.get(key)?.metadata);
    },
    delete: async (key, context) => {
      open();
      assertKey(key);
      assertActive(context, clock);
      entries.delete(key);
    },
    exists: async (key, context) => {
      open();
      assertKey(key);
      assertActive(context, clock);
      return entries.has(key);
    },
    list: async (prefix, context) => {
      open();
      const normalized = prefix === undefined ? "" : assertPrefix(prefix);
      assertActive(context, clock);
      return Object.freeze([...entries.keys()].filter((key) => key.startsWith(normalized)).sort());
    },
  });
  const client = createBucketClient({ ownerId, bucketId, source: provider });
  const fake = Object.freeze({
    ...client,
    capabilities: provider.capabilities!,
    provider,
    client,
    stateRoot,
    seed: (key: string, bytes: Uint8Array, putOptions?: BucketPutOptions) =>
      client.put(key, bytes, putOptions),
    read: (key: string) => client.get(key),
    inspect: () =>
      Object.freeze(
        [...entries.values()]
          .sort((left, right) => left.key.localeCompare(right.key))
          .map(copyObject),
      ),
    clear: () => entries.clear(),
    close: async () => {
      if (closed) return;
      closed = true;
      entries.clear();
      rootOwner.cleanup(false);
    },
  });
  return fake as TestBucketFake;

  async function write(
    key: string,
    bytes: Uint8Array,
    putOptions: BucketPutOptions | undefined,
    context: BucketOperationContext | undefined,
  ): Promise<void> {
    open();
    assertKey(key);
    assertActive(context, clock);
    if (!(bytes instanceof Uint8Array)) throw new TypeError("Bucket bytes must be a Uint8Array");
    if (maxObjectBytes !== undefined && bytes.byteLength > maxObjectBytes) {
      throw new RangeError("Bucket object exceeds maxObjectBytes");
    }
    const contentType = putOptions?.contentType;
    if (allowedContentTypes !== undefined && !allowedContentTypes.includes(contentType ?? "")) {
      throw new TypeError("Bucket content type is not allowed");
    }
    const copy = new Uint8Array(bytes);
    const etag = `sha256:${createHash("sha256").update(copy).digest("hex")}`;
    const metadata = Object.freeze({
      etag,
      contentHash: etag,
      size: copy.byteLength,
      ...(contentType === undefined ? {} : { contentType }),
      ...(putOptions?.metadata === undefined ? {} : { metadata: { ...putOptions.metadata } }),
    });
    failures.check("bucket.before-write");
    entries.set(key, { key, bytes: copy, metadata });
    failures.check("bucket.after-write-before-ack");
  }

  function open(): void {
    if (closed) throw new Error("Test bucket is closed");
  }
}

export const createTestBucket = createTestBucketFake;

function assertActive(context: BucketOperationContext | undefined, clock: () => number): void {
  if (context?.signal.aborted) throw new BucketOperationCancelledError();
  if (context?.deadlineMs !== undefined && context.deadlineMs <= clock()) {
    throw new BucketOperationTimeoutError();
  }
}

function assertKey(value: string): void {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    value.startsWith(".zsys") ||
    value.startsWith("__zsys")
  ) {
    throw new TypeError("Bucket key is invalid");
  }
}

function assertPrefix(value: string): string {
  if (value === "") return value;
  const trimmed = value.endsWith("/") ? value.slice(0, -1) : value;
  if (trimmed !== "") assertKey(trimmed);
  return value;
}

function copyMetadata(value: BucketObjectMetadata | undefined): BucketObjectMetadata | undefined {
  if (value === undefined) return undefined;
  return Object.freeze({
    ...value,
    ...(value.metadata === undefined ? {} : { metadata: { ...value.metadata } }),
  });
}

function copyObject(value: TestBucketObject): TestBucketObject {
  return Object.freeze({
    bytes: new Uint8Array(value.bytes),
    key: value.key,
    metadata: copyMetadata(value.metadata)!,
  });
}
