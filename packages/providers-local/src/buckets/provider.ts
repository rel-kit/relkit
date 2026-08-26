import {
  BucketCapabilityError,
  type BucketOperationContext,
  type BucketPutOptions,
} from "@zsys/buckets";
import { normalizeBucketKey, normalizeBucketPrefix } from "./keys.js";
import { paginateKeys } from "./pagination.js";
import { normalizePolicy } from "./policy.js";
import { createBucketStorage, type LocalBucketStorage } from "./storage.js";
import {
  LOCAL_BUCKET_CAPABILITIES,
  LocalBucketStateError,
  type LocalBucketListOptions,
  type LocalBucketListPage,
  type LocalBucketPolicy,
  type LocalBucketProvider,
  type LocalBucketProviderOptions,
} from "./types.js";
import {
  deleteObject,
  existsObject,
  getObject,
  headObject,
  listKeys,
  putObject,
  assertActive,
} from "./operations.js";

export function createLocalBucketProvider(
  optionsOrRoot: LocalBucketProviderOptions | string,
  policy?: LocalBucketPolicy,
): LocalBucketProvider {
  const options =
    typeof optionsOrRoot === "string"
      ? { root: optionsOrRoot, ...(policy === undefined ? {} : { policy }) }
      : optionsOrRoot;
  const root = options.root ?? options.stateRoot;
  if (root === undefined || root.trim() === "") {
    throw new LocalBucketStateError("Bucket root is required");
  }
  const normalizedPolicy = normalizePolicy(options);
  const defaultPageSize = options.pageSize;
  if (
    defaultPageSize !== undefined &&
    (!Number.isSafeInteger(defaultPageSize) || defaultPageSize <= 0)
  ) {
    throw new LocalBucketStateError("Bucket pageSize must be a positive safe integer");
  }
  const storage = createBucketStorage(root);
  let closed = false;
  const listPage = async (
    prefix?: string,
    options?: LocalBucketListOptions,
  ): Promise<LocalBucketListPage> => {
    ensureOpen(closed);
    const normalizedPrefix = normalizeBucketPrefix(prefix);
    const keys = await listKeys(storage, normalizedPrefix);
    const pageOptions = pageOptionsFor(options, defaultPageSize);
    return paginateKeys(keys, normalizedPrefix, pageOptions);
  };
  const list = (async (prefix?: string, options?: LocalBucketListOptions) => {
    if (isOperationContext(options)) {
      ensureOpen(closed);
      const normalizedPrefix = normalizeBucketPrefix(prefix);
      assertActive(options);
      return Object.freeze(await listKeys(storage, normalizedPrefix));
    }
    if (options !== undefined) return listPage(prefix, options);
    ensureOpen(closed);
    const normalizedPrefix = normalizeBucketPrefix(prefix);
    return Object.freeze(await listKeys(storage, normalizedPrefix));
  }) as LocalBucketProvider["list"];
  const close = async (): Promise<void> => {
    closed = true;
  };
  const ready = async (): Promise<void> => {
    ensureOpen(closed);
    await storage.ready();
  };
  const open = (): void => ensureOpen(closed);
  const inspector = Object.freeze({
    list: async (request: {
      readonly prefix?: string;
      readonly cursor?: string;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => {
      if (request.signal.aborted) throw request.signal.reason;
      const page = await listPage(request.prefix, {
        limit: request.limit,
        ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      });
      const items = await Promise.all(
        page.items.map(async (key) => {
          const metadata = await headObject(storage, key, undefined, open);
          return { key, ...(metadata === undefined ? {} : { metadata }) };
        }),
      );
      return { ...page, items };
    },
    preview: async (request: {
      readonly key: string;
      readonly offset: number;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => {
      if (request.signal.aborted) throw request.signal.reason;
      const [metadata, bytes] = await Promise.all([
        headObject(storage, request.key, undefined, open),
        getObject(storage, request.key, undefined, open),
      ]);
      if (metadata === undefined || bytes === undefined) return undefined;
      return {
        bytes: bytes.slice(request.offset, request.offset + request.limit),
        metadata,
        totalBytes: bytes.byteLength,
      };
    },
  });
  return Object.freeze({
    capabilities: LOCAL_BUCKET_CAPABILITIES,
    root: storage.root,
    policy: normalizedPolicy,
    put: (
      key: string,
      bytes: Uint8Array,
      options?: BucketPutOptions,
      context?: BucketOperationContext,
    ) => putObject(storage, normalizedPolicy, key, bytes, options, context, open),
    get: (key: string, context?: BucketOperationContext) => getObject(storage, key, context, open),
    head: (key: string, context?: BucketOperationContext) =>
      headObject(storage, key, context, open),
    delete: (key: string, context?: BucketOperationContext) =>
      deleteObject(storage, key, context, open),
    exists: (key: string, context?: BucketOperationContext) =>
      existsObject(storage, key, context, open),
    list,
    listPage,
    createReadUrl: (key: string, context?: BucketOperationContext) =>
      unsupported("signedReadUrl", "createReadUrl", key, context, open),
    createWriteUrl: (key: string, context?: BucketOperationContext) =>
      unsupported("signedWriteUrl", "createWriteUrl", key, context, open),
    ready,
    close,
    inspector,
  });
}

export const createLocalBucketProviderForTest = createLocalBucketProvider;

function pageOptionsFor(
  options: LocalBucketListOptions | undefined,
  defaultPageSize: number | undefined,
): LocalBucketListOptions | undefined {
  if (options !== undefined || defaultPageSize === undefined) return options;
  return { limit: defaultPageSize };
}

function unsupported(
  capability: "signedReadUrl" | "signedWriteUrl",
  operation: "createReadUrl" | "createWriteUrl",
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
): Promise<never> {
  open();
  normalizeBucketKey(key);
  assertActive(context);
  return Promise.reject(new BucketCapabilityError(capability, operation));
}

function ensureOpen(closed: boolean): void {
  if (closed) throw new LocalBucketStateError("Bucket provider is closed");
}

function isOperationContext(value: unknown): value is BucketOperationContext {
  return value !== null && typeof value === "object" && "operation" in value && "signal" in value;
}
