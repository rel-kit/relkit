import { Cause, Effect, Exit, Layer } from "effect";
import { BucketValidationError } from "./bucket-validation-error.js";
import { BucketCapabilityError, BucketProviderFailureError } from "./client-errors.js";
import { observeBucket } from "./client-observability.js";
import {
  createBucketReadUrlEffect,
  createBucketWriteUrlEffect,
  deleteBucketEffect,
  existsBucketEffect,
  getBucketEffect,
  headBucketEffect,
  listBucketEffect,
  putBucketEffect,
} from "./client-effects.js";
import { BucketRuntime, asProviderEffect } from "./client-runtime.js";
import { assertKey, assertPrefix, validateTextIdEffect } from "./client-key.js";
import { classifyEffect, notifyEffect } from "./client-utils.js";
import type {
  BucketClient,
  BucketClientOptions,
  BucketOperation,
  BucketOperationOutcome,
  BucketProvider,
  BucketPutOptions,
} from "./client.types.js";

export {
  BucketCapabilityError,
  BucketDependencyError,
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  BucketProviderError,
  BucketProviderFailureError,
} from "./client-errors.js";
export type * from "./client.types.js";

/** Creates the Promise compatibility client over the Effect bucket operations.
 * @param options - Owner, provider, bridge, deadline, and observation hooks.
 * @returns Frozen client whose operations return Promises.
 * @throws TypeError for invalid owner or bucket identifiers; BucketProviderError for a malformed source.
 * @example createBucketClient({ ownerId: "job", bucketId: "assets", source: provider }).get("a");
 */
export function createBucketClient(options: BucketClientOptions): BucketClient {
  const exit = Effect.runSyncExit(createBucketClientEffect(options));
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (error instanceof BucketValidationError) throw new TypeError(error.message);
  throw error;
}

/** Creates the compatibility client inside Effect with tagged construction failures.
 * @param options - Owner, provider, bridge, deadline, and observation hooks.
 * @returns Effect of a frozen client or tagged validation/provider error.
 * @example Effect.runSync(createBucketClientEffect({ ownerId: "job", bucketId: "assets", source: {} }));
 */
export const createBucketClientEffect = Effect.fn("bucket.createClient")(
  (options: BucketClientOptions) =>
    observeBucket(
      "createClient",
      Effect.gen(function* () {
        if (options === null || typeof options !== "object" || Array.isArray(options))
          return yield* new BucketValidationError({
            message: "Bucket client options must be an object",
          });
        yield* validateTextIdEffect(options.ownerId, "ownerId");
        yield* validateTextIdEffect(options.bucketId, "bucketId");
        const provider = yield* asProviderEffect(options.source);
        return makeClient(options, provider);
      }),
    ),
);

/** Assemble the immutable adapter after Effect has validated its dependencies. */
function makeClient(options: BucketClientOptions, provider: BucketProvider): BucketClient {
  const recordOperation = (operation: BucketOperation, outcome: BucketOperationOutcome): void => {
    Effect.runSync(
      notifyEffect(options.onOperation, {
        capability: "buckets",
        operation,
        ownerId: options.ownerId,
        bucketId: options.bucketId,
        outcome,
      }),
    );
  };
  const run = <A, E>(
    operation: BucketOperation,
    input: unknown,
    effect: Effect.Effect<A, E, BucketRuntime>,
  ): Promise<A> => {
    const signal = options.signal?.() ?? new AbortController().signal;
    const deadlineMs = options.deadline?.();
    const invocationOptions: BucketClientOptions = {
      ...options,
      signal: () => signal,
      deadline: () => deadlineMs,
    };
    const layer = Layer.succeed(
      BucketRuntime,
      BucketRuntime.of({
        options: invocationOptions,
        provider,
        bridgeOwned: options.bridge !== undefined,
      }),
    );
    const execute = () => Effect.runPromise(Effect.provide(effect, layer));
    if (options.bridge !== undefined && options.declared !== false)
      Effect.runSync(
        notifyEffect(options.onObservedEdge, {
          relationship: "uses-bucket",
          from: options.ownerId,
          to: options.bucketId,
        }),
      );
    let promise: Promise<A>;
    try {
      promise = options.bridge
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
    } catch (cause) {
      promise = Promise.reject(cause);
    }
    return Promise.resolve(promise).then(
      (value) => {
        if (options.bridge !== undefined) recordOperation(operation, "success");
        return value;
      },
      (cause: unknown) => {
        if (options.bridge !== undefined)
          recordOperation(
            operation,
            cause instanceof BucketCapabilityError
              ? "unsupported"
              : Effect.runSync(classifyEffect(cause)),
          );
        if (cause instanceof BucketProviderFailureError) throw cause.cause;
        if (cause instanceof BucketValidationError) throw new TypeError(cause.message);
        throw cause;
      },
    );
  };
  return Object.freeze({
    put: (key: string, bytes: Uint8Array, putOptions?: BucketPutOptions) => {
      validateSync("put", () => assertKey(key));
      if (!(bytes instanceof Uint8Array)) {
        const error = new TypeError("Bucket bytes must be a Uint8Array");
        recordValidationFailure("put", error);
        return Promise.reject(error);
      }
      return run(
        "put",
        { key, bytes, options: putOptions },
        putBucketEffect(key, bytes, putOptions),
      );
    },
    get: (key: string) => {
      validateSync("get", () => assertKey(key));
      return run("get", { key }, getBucketEffect(key));
    },
    head: (key: string) => {
      validateSync("head", () => assertKey(key));
      return run("head", { key }, headBucketEffect(key));
    },
    delete: (key: string) => {
      validateSync("delete", () => assertKey(key));
      return run("delete", { key }, deleteBucketEffect(key));
    },
    exists: (key: string) => {
      validateSync("exists", () => assertKey(key));
      return run("exists", { key }, existsBucketEffect(key));
    },
    list: (prefix?: string) => {
      if (prefix !== undefined) validateSync("list", () => assertPrefix(prefix));
      return run("list", { prefix }, listBucketEffect(prefix));
    },
    createReadUrl: (key: string) => {
      validateSync("createReadUrl", () => assertKey(key));
      return run("createReadUrl", { key }, createBucketReadUrlEffect(key));
    },
    createWriteUrl: (key: string) => {
      validateSync("createWriteUrl", () => assertKey(key));
      return run("createWriteUrl", { key }, createBucketWriteUrlEffect(key));
    },
  });
}

/** Preserve synchronous validation while recording the failed invocation. */
function validateSync(operation: BucketOperation, validate: () => void): void {
  try {
    validate();
  } catch (cause) {
    recordValidationFailure(operation, cause);
    throw cause;
  }
}

/** Count a pre-provider validation failure without changing its original error. */
function recordValidationFailure(operation: BucketOperation, cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  void Effect.runSync(
    Effect.exit(observeBucket(operation, Effect.fail(new BucketValidationError({ message })))),
  );
}
