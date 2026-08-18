import type { MaybePromise } from "@zsys/contracts";
import {
  CacheCapabilityError,
  CacheDependencyError,
  CacheTtlPolicyError,
  type CacheCapability,
  type CacheClient,
  type CacheClientOptions,
  type CacheOperation,
  type CacheOperationContext,
  type CacheOperationOutcome,
} from "./client-types.js";
import {
  asProvider,
  classify,
  notify,
  runAbortable,
  supports,
  validatePolicy,
} from "./client-utils.js";
import { createCacheOperations } from "./client-operations.js";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@zsys/schema";

export {
  CacheCapabilityError,
  CacheDependencyError,
  CacheIncrementUnsupportedError,
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  CacheProviderError,
  CacheSchemaValidationError,
  CacheTtlPolicyError,
} from "./client-types.js";
export type * from "./client-types.js";

export function createCacheClient<
  const KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  const ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: CacheClientOptions<KeySchema, ValueSchema>,
): CacheClient<InferInput<KeySchema>, InferOutput<ValueSchema>> {
  assertText(options.ownerId, "ownerId");
  assertText(options.cacheId, "cacheId");
  const provider = asProvider(options.source);
  const keySchema = (options.keySchema ?? options.key ?? options.descriptor?.key) as
    KeySchema | undefined;
  const valueSchema = (options.valueSchema ?? options.value ?? options.descriptor?.value) as
    ValueSchema | undefined;
  assertSchema(keySchema, "key");
  assertSchema(valueSchema, "value");
  const defaultTtlMs = options.defaultTtlMs ?? options.descriptor?.defaultTtlMs;
  const maxTtlMs = options.maxTtlMs ?? options.descriptor?.maxTtlMs;
  validatePolicy(defaultTtlMs, "defaultTtlMs");
  validatePolicy(maxTtlMs, "maxTtlMs");
  if (defaultTtlMs !== undefined && maxTtlMs !== undefined && defaultTtlMs > maxTtlMs) {
    throw new CacheTtlPolicyError("Cache defaultTtlMs must not exceed maxTtlMs");
  }
  const declared = options.declared !== false;

  const run = <A>(
    operation: CacheOperation,
    capability: CacheCapability | undefined,
    work: (context: CacheOperationContext) => MaybePromise<A>,
    validate: (value: A) => MaybePromise<A>,
  ): Promise<A> => {
    const signal = options.signal?.() ?? new AbortController().signal;
    const deadlineMs = options.deadline?.();
    let outcome: CacheOperationOutcome = "provider-failure";
    const execute = async (): Promise<A> => {
      if (!declared) throw new CacheDependencyError(options.cacheId);
      if (capability !== undefined && !supports(provider.capabilities, capability)) {
        throw new CacheCapabilityError(capability, operation);
      }
      const context = { operation, signal, ...(deadlineMs === undefined ? {} : { deadlineMs }) };
      const value = await (options.bridge
        ? work(context)
        : runAbortable(signal, deadlineMs, () => work(context)));
      const result = await validate(value);
      outcome = "success";
      return result;
    };
    if (declared) {
      notify(options.onObservedEdge, {
        relationship: "uses-cache",
        from: options.ownerId,
        to: options.cacheId,
      });
    }
    const bridgeOptions = {
      name: `zsys.cache.${options.cacheId}.${operation}`,
      attributes: { "zsys.cache.id": options.cacheId, "zsys.cache.operation": operation },
      signal,
    };
    const promise = options.bridge ? options.bridge.run(execute, bridgeOptions) : execute();
    return Promise.resolve(promise)
      .catch((cause) => {
        outcome = classify(cause);
        throw cause;
      })
      .finally(() =>
        notify(options.onOperation, {
          capability: "cache",
          operation,
          ownerId: options.ownerId,
          cacheId: options.cacheId,
          outcome,
        }),
      );
  };

  const client = createCacheOperations<KeySchema, ValueSchema>({
    provider,
    keySchema,
    valueSchema,
    defaultTtlMs,
    maxTtlMs,
    call: (operation, work, validate, capability) => run(operation, capability, work, validate),
  });
  return client;
}

export const createCacheClientAdapter = createCacheClient;
export const createCacheInvocationAdapter = createCacheClient;

function assertText(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`Cache ${name} must be non-empty`);
  }
}

function assertSchema(value: StandardSchemaV1 | undefined, name: string): void {
  if (value === undefined) return;
  const standard = value["~standard"];
  if (standard?.version !== 1 || typeof standard.validate !== "function") {
    throw new TypeError(`Cache ${name} must be a Standard Schema v1 validator`);
  }
}
