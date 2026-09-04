import type { MaybePromise } from "@relkit/contracts";
import {
  BucketCapabilityError,
  BucketDependencyError,
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  BucketProviderError,
  type BucketCapability,
  type BucketClient,
  type BucketClientOptions,
  type BucketOperation,
  type BucketOperationContext,
  type BucketOperationObservation,
  type BucketOperationOutcome,
  type BucketProvider,
  type BucketObjectMetadata,
  type BucketPutOptions,
} from "./client-types.js";
import {
  assertKey,
  assertPrefix,
  assertText,
  asProvider,
  classify,
  notify,
  required,
  runAbortable,
  supports,
  validateBoolean,
  validateBytes,
  validateKeys,
  validateMetadata,
  validateText,
} from "./client-utils.js";

export {
  BucketCapabilityError,
  BucketDependencyError,
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  BucketProviderError,
} from "./client-types.js";
export type * from "./client-types.js";

export function createBucketClient(options: BucketClientOptions): BucketClient {
  assertText(options.ownerId, "ownerId");
  assertText(options.bucketId, "bucketId");
  const provider = asProvider(options.source);
  const declared = options.declared !== false;
  const run = <A>(
    operation: BucketOperation,
    input: unknown,
    capability: BucketCapability | undefined,
    work: (context: BucketOperationContext) => MaybePromise<A>,
    validate: (value: A) => A,
  ): Promise<A> => {
    const signal = options.signal?.() ?? new AbortController().signal;
    const deadlineMs = options.deadline?.();
    if (declared)
      notify(options.onObservedEdge, {
        relationship: "uses-bucket",
        from: options.ownerId,
        to: options.bucketId,
      });
    const context = { operation, signal, ...(deadlineMs === undefined ? {} : { deadlineMs }) };
    let outcome: BucketOperationOutcome = "provider-failure";
    const execute = async (): Promise<A> => {
      if (!declared) throw new BucketDependencyError(options.bucketId);
      if (capability !== undefined && !supports(provider.capabilities, capability)) {
        throw new BucketCapabilityError(capability, operation);
      }
      const value = await (options.bridge
        ? work(context)
        : runAbortable(signal, deadlineMs, () => work(context)));
      const result = validate(value);
      outcome = "success";
      return result;
    };
    const promise = options.bridge
      ? options.bridge.run(execute, {
          name: `relkit.bucket.${options.bucketId}.${operation}`,
          attributes: {
            "relkit.bucket.id": options.bucketId,
            "relkit.bucket.operation": operation,
          },
          signal,
          input,
        })
      : execute();
    return Promise.resolve(promise)
      .catch((cause) => {
        outcome = cause instanceof BucketCapabilityError ? "unsupported" : classify(cause);
        throw cause;
      })
      .finally(() =>
        notify(options.onOperation, {
          capability: "buckets",
          operation,
          ownerId: options.ownerId,
          bucketId: options.bucketId,
          outcome,
        }),
      );
  };
  const call = <A>(
    operation: BucketOperation,
    input: unknown,
    work: (context: BucketOperationContext) => MaybePromise<A>,
    validate: (value: A) => A,
    capability?: BucketCapability,
  ): Promise<A> => run(operation, input, capability, work, validate);
  return Object.freeze({
    put: (key: string, bytes: Uint8Array, putOptions?: BucketPutOptions) => {
      assertKey(key);
      if (!(bytes instanceof Uint8Array))
        return Promise.reject(new TypeError("Bucket bytes must be a Uint8Array"));
      return call(
        "put",
        { key, bytes, options: putOptions },
        (context) => required(provider.put, "put")(key, bytes, putOptions, context),
        () => undefined,
      );
    },
    get: (key: string) => {
      assertKey(key);
      return call(
        "get",
        { key },
        (context) => required(provider.get, "get")(key, context),
        validateBytes,
      );
    },
    head: (key: string) => {
      assertKey(key);
      return call(
        "head",
        { key },
        (context) => required(provider.head, "head")(key, context),
        validateMetadata,
      );
    },
    delete: (key: string) => {
      assertKey(key);
      return call(
        "delete",
        { key },
        (context) => required(provider.delete, "delete")(key, context),
        () => undefined,
      );
    },
    exists: (key: string) => {
      assertKey(key);
      return call(
        "exists",
        { key },
        (context) => required(provider.exists, "exists")(key, context),
        validateBoolean,
      );
    },
    list: (prefix?: string) => {
      if (prefix !== undefined) assertPrefix(prefix);
      return call(
        "list",
        { prefix },
        (context) => required(provider.list, "list")(prefix, context),
        validateKeys,
      );
    },
    createReadUrl: (key: string) => {
      assertKey(key);
      return call(
        "createReadUrl",
        { key },
        (context) => required(provider.createReadUrl, "createReadUrl")(key, context),
        validateText,
        "signedReadUrl",
      );
    },
    createWriteUrl: (key: string) => {
      assertKey(key);
      return call(
        "createWriteUrl",
        { key },
        (context) => required(provider.createWriteUrl, "createWriteUrl")(key, context),
        validateText,
        "signedWriteUrl",
      );
    },
  });
}
