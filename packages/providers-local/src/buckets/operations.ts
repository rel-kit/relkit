import { createHash } from "node:crypto";
import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  type BucketOperationContext,
  type BucketPutOptions,
} from "@relkit/buckets";
import { normalizeBucketKey } from "./keys.js";
import { validatePut } from "./policy.js";
import type { LocalBucketStorage } from "./storage.js";
import {
  LocalBucketStateError,
  type LocalBucketObjectMetadata,
  type LocalBucketPolicy,
  type StoredLocalBucketObject,
} from "./types.js";

export async function putObject(
  storage: LocalBucketStorage,
  policy: Readonly<LocalBucketPolicy>,
  key: string,
  bytes: Uint8Array,
  options: BucketPutOptions | undefined,
  context: BucketOperationContext | undefined,
  open: () => void,
): Promise<void> {
  open();
  const normalizedKey = normalizeBucketKey(key);
  assertActive(context);
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Bucket bytes must be a Uint8Array");
  const copy = new Uint8Array(bytes);
  const prepared = validatePut(copy, options, policy);
  const contentHash = hash(copy);
  await storage.write({
    version: 1,
    key: normalizedKey,
    size: copy.byteLength,
    contentHash,
    etag: contentHash,
    ...prepared,
    data: Buffer.from(copy).toString("base64"),
  });
}

export async function getObject(
  storage: LocalBucketStorage,
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
): Promise<Uint8Array | undefined> {
  const object = await loadObject(storage, key, context, open);
  return object === undefined ? undefined : decode(object);
}

export async function headObject(
  storage: LocalBucketStorage,
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
): Promise<LocalBucketObjectMetadata | undefined> {
  const object = await loadObject(storage, key, context, open);
  if (object === undefined) return undefined;
  decode(object);
  return Object.freeze({
    etag: object.etag,
    contentHash: object.contentHash,
    size: object.size,
    ...(object.contentType === undefined ? {} : { contentType: object.contentType }),
    ...(Object.keys(object.metadata).length === 0 ? {} : { metadata: object.metadata }),
  }) as LocalBucketObjectMetadata;
}

export async function deleteObject(
  storage: LocalBucketStorage,
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
): Promise<void> {
  open();
  const normalizedKey = normalizeBucketKey(key);
  assertActive(context);
  await storage.remove(normalizedKey);
}

export async function existsObject(
  storage: LocalBucketStorage,
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
): Promise<boolean> {
  return (await headObject(storage, key, context, open)) !== undefined;
}

export async function listKeys(storage: LocalBucketStorage, prefix: string): Promise<string[]> {
  const objects = await storage.list();
  return objects
    .filter((object) => object.key.startsWith(prefix))
    .map((object) => {
      decode(object);
      return object.key;
    })
    .sort((left, right) => left.localeCompare(right));
}

export function assertActive(context?: BucketOperationContext): void {
  if (context?.signal.aborted) throw new BucketOperationCancelledError();
  if (context?.deadlineMs !== undefined && context.deadlineMs <= Date.now()) {
    throw new BucketOperationTimeoutError();
  }
}

async function loadObject(
  storage: LocalBucketStorage,
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
): Promise<StoredLocalBucketObject | undefined> {
  open();
  const normalizedKey = normalizeBucketKey(key);
  assertActive(context);
  const object = await storage.read(normalizedKey);
  if (object !== undefined) decode(object);
  return object;
}

function decode(object: StoredLocalBucketObject): Uint8Array {
  const bytes = new Uint8Array(Buffer.from(object.data, "base64"));
  if (
    bytes.byteLength !== object.size ||
    hash(bytes) !== object.contentHash ||
    object.etag !== object.contentHash
  ) {
    throw new LocalBucketStateError("Bucket object integrity check failed");
  }
  return bytes;
}

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
