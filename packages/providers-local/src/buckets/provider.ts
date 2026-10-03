import { promiseBucketProvider } from "./provider.adapter.js";
import { type BucketOperationContext } from "@relkit/buckets";
import { Context, Effect, Layer, Ref } from "effect";
import { localOperation, localPromise, localSync, runLocalSync } from "../local-effect.js";
import { normalizeBucketKey, normalizeBucketPrefix } from "./keys.js";
import { paginateKeys } from "./pagination.js";
import { normalizePolicy } from "./policy.js";
import { createBucketStorage } from "./storage.js";
import {
  LOCAL_BUCKET_CAPABILITIES,
  LocalBucketStateError,
  type LocalBucketListOptions,
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
import type { LocalBucketEffects } from "./provider.types.js";

/** Owns bucket admission, object IO and ordered inspection. */
export class LocalBucketService extends Context.Service<LocalBucketService, LocalBucketEffects>()(
  "@relkit/providers-local/Bucket",
) {}

/**
 * Creates a filesystem bucket with the established Promise and overload contracts.
 * @param optionsOrRoot - Owned directory or full bucket configuration.
 * @param policy - Policy when passing a directory directly.
 * @returns A provider with validated synchronous construction and lazy object IO.
 */
export function createLocalBucketProvider(
  optionsOrRoot: LocalBucketProviderOptions | string,
  policy?: LocalBucketPolicy,
): LocalBucketProvider {
  return promiseBucketProvider(runLocalSync(makeLocalBucketService(optionsOrRoot, policy)));
}

/** The same constructor is deterministic when supplied an isolated temporary root. */
export const createLocalBucketProviderForTest = createLocalBucketProvider;

/**
 * Provides a bucket service and closes its admission gate with the scope.
 * @param options - Bucket directory and policy.
 * @returns A live layer that tests can replace with Layer.succeed.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalBucketService, localBucketLayer } from "./provider.js";
 *
 * const program = Effect.gen(function* () {
 *   const bucket = yield* LocalBucketService;
 *     yield* bucket.put("hello.txt", new TextEncoder().encode("hello"));
 *     return yield* bucket.head("hello.txt");
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(localBucketLayer({ root: "/tmp/example-bucket" }))));
 * ```
 */
export function localBucketLayer(options: LocalBucketProviderOptions) {
  return Layer.effect(
    LocalBucketService,
    Effect.acquireRelease(makeLocalBucketService(options), (service) => service.close()),
  );
}

/**
 * Validates construction and creates one bucket lifecycle owner.
 * @param optionsOrRoot - Owned root or full configuration.
 * @param policy - Policy used with the root shorthand.
 * @returns A synchronous acquisition effect with lazy operations.
 */
export const makeLocalBucketService = Effect.fn("Bucket.create")(function* (
  optionsOrRoot: LocalBucketProviderOptions | string,
  policy?: LocalBucketPolicy,
) {
  const options =
    typeof optionsOrRoot === "string"
      ? { root: optionsOrRoot, ...(policy === undefined ? {} : { policy }) }
      : optionsOrRoot;
  const prepared = yield* localSync(() => {
    const root = options.root ?? options.stateRoot;
    if (root === undefined || root.trim() === "")
      throw new LocalBucketStateError("Bucket root is required");
    if (
      options.pageSize !== undefined &&
      (!Number.isSafeInteger(options.pageSize) || options.pageSize <= 0)
    )
      throw new LocalBucketStateError("Bucket pageSize must be a positive safe integer");
    return { policy: normalizePolicy(options), storage: createBucketStorage(root) };
  });
  const { storage } = prepared;
  const closed = yield* Ref.make(false);
  /**
   * Rejects operations after the owner has closed admission.
   * @returns Nothing; throws the established closed-provider error.
   */
  const open = () => {
    if (Ref.getUnsafe(closed)) throw new LocalBucketStateError("Bucket provider is closed");
  };
  /**
   * Validates bucket admission, key syntax and cancellation before IO.
   * @param key - Normalized or caller-provided storage key.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns A lazy validation effect preserving expected failures.
   */
  const validate = Effect.fn("Bucket.validate")((key: string, context?: BucketOperationContext) =>
    localOperation(
      "Bucket.validate",
      localSync(() => {
        open();
        normalizeBucketKey(key);
        assertActive(context);
      }),
    ),
  );
  /**
   * Lists validated bucket keys under the requested prefix.
   * @param prefix - Optional key prefix for selection.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns A lazy effect yielding immutable sorted keys.
   */
  const list = Effect.fn("Bucket.list")(
    function* (prefix?: string, context?: BucketOperationContext) {
      const normalized = yield* localSync(() => {
        open();
        assertActive(context);
        return normalizeBucketPrefix(prefix);
      });
      return Object.freeze(yield* listKeys(storage, normalized));
    },
    (effect) => localOperation("Bucket.list", effect),
  );
  /**
   * Lists a bounded, cursor-validated page of bucket keys.
   * @param prefix - Optional key prefix for selection.
   * @param pageOptions - Cursor and page-size settings.
   * @returns A lazy effect yielding the immutable key page.
   */
  const listPage: LocalBucketEffects["listPage"] = Effect.fn("Bucket.listPage")(
    function* (prefix?: string, pageOptions?: LocalBucketListOptions) {
      const normalized = yield* localSync(() => {
        open();
        return normalizeBucketPrefix(prefix);
      });
      const keys = yield* listKeys(storage, normalized);
      return yield* localSync(() =>
        paginateKeys(
          keys,
          normalized,
          pageOptions ?? (options.pageSize === undefined ? undefined : { limit: options.pageSize }),
        ),
      );
    },
    (effect) => localOperation("Bucket.listPage", effect),
  );
  return LocalBucketService.of({
    metadata: {
      capabilities: LOCAL_BUCKET_CAPABILITIES,
      root: storage.root,
      policy: prepared.policy,
    },
    validate,
    list,
    listPage,
    put: (key, bytes, settings, context) =>
      putObject(storage, prepared.policy, key, bytes, settings, context, open),
    get: (key, context) => getObject(storage, key, context, open),
    head: (key, context) => headObject(storage, key, context, open),
    delete: (key, context) => deleteObject(storage, key, context, open),
    exists: (key, context) => existsObject(storage, key, context, open),
    close: Effect.fn("Bucket.close")(() => localOperation("Bucket.close", Ref.set(closed, true))),
    ready: Effect.fn("Bucket.ready")(() =>
      localOperation(
        "Bucket.ready",
        Effect.andThen(
          localSync(open),
          localPromise(() => storage.ready()),
        ),
      ),
    ),
    inspectList: Effect.fn("Bucket.inspectList")(
      function* (request) {
        yield* localSync(() => {
          if (request.signal.aborted) throw request.signal.reason;
        });
        const page = yield* listPage(request.prefix, {
          limit: request.limit,
          ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
        });
        const items = yield* Effect.forEach(
          page.items,
          (key) =>
            Effect.map(headObject(storage, key, undefined, open), (metadata) => ({
              key,
              ...(metadata === undefined ? {} : { metadata }),
            })),
          { concurrency: 8 },
        );
        return { ...page, items };
      },
      (effect) => localOperation("Bucket.inspectList", effect),
    ),
    preview: Effect.fn("Bucket.preview")(
      function* (request) {
        yield* localSync(() => {
          if (request.signal.aborted) throw request.signal.reason;
        });
        const [metadata, bytes] = yield* Effect.all(
          [
            headObject(storage, request.key, undefined, open),
            getObject(storage, request.key, undefined, open),
          ],
          { concurrency: 2 },
        );
        return metadata === undefined || bytes === undefined
          ? undefined
          : {
              bytes: bytes.slice(request.offset, request.offset + request.limit),
              metadata,
              totalBytes: bytes.byteLength,
            };
      },
      (effect) => localOperation("Bucket.preview", effect),
    ),
  });
});
