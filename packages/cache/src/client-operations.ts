import type { MaybePromise } from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import {
  CacheIncrementUnsupportedError,
  type CacheClient,
  type CacheOperation,
  type CacheOperationContext,
  type CacheOperationOptions,
  type CacheProvider,
} from "./client-types.js";
import {
  normalizeTtl,
  required,
  validateBoolean,
  validateIncrementDelta,
  validateSchema,
} from "./client-utils.js";

interface CacheOperationDependencies<
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1,
> {
  readonly provider: CacheProvider;
  readonly keySchema: KeySchema | undefined;
  readonly valueSchema: ValueSchema | undefined;
  readonly defaultTtlMs: number | undefined;
  readonly maxTtlMs: number | undefined;
  readonly call: <A>(
    operation: CacheOperation,
    work: (context: CacheOperationContext) => MaybePromise<A>,
    validate: (value: A) => MaybePromise<A>,
    capability?: "increment",
  ) => Promise<A>;
}

export function createCacheOperations<
  const KeySchema extends StandardSchemaV1,
  const ValueSchema extends StandardSchemaV1,
>(
  dependencies: CacheOperationDependencies<KeySchema, ValueSchema>,
): CacheClient<InferInput<KeySchema>, InferOutput<ValueSchema>> {
  const { provider, keySchema, valueSchema, defaultTtlMs, maxTtlMs, call } = dependencies;
  const parseKey = (key: unknown): Promise<unknown> => validateSchema(keySchema, key, "key");
  const parseValue = (value: unknown): Promise<unknown> =>
    validateSchema(valueSchema, value, "value");
  const ttl = (
    optionsValue: CacheOperationOptions | undefined,
  ): CacheOperationOptions | undefined => normalizeTtl(optionsValue?.ttlMs, defaultTtlMs, maxTtlMs);

  const client = {
    get: (key: InferInput<KeySchema>) =>
      call(
        "get",
        async (context) => required(provider.get, "get")(await parseKey(key), context),
        async (value) => (value === undefined ? undefined : await parseValue(value)),
      ),
    set: (
      key: InferInput<KeySchema>,
      value: InferOutput<ValueSchema>,
      optionsValue?: CacheOperationOptions,
    ) =>
      call(
        "set",
        async (context) =>
          required(provider.set, "set")(
            await parseKey(key),
            await parseValue(value),
            ttl(optionsValue),
            context,
          ),
        () => undefined,
      ),
    delete: (key: InferInput<KeySchema>) =>
      call(
        "delete",
        async (context) => required(provider.delete, "delete")(await parseKey(key), context),
        () => undefined,
      ),
    has: (key: InferInput<KeySchema>) =>
      call(
        "has",
        async (context) => required(provider.has, "has")(await parseKey(key), context),
        validateBoolean,
      ),
    getOrSet: (
      key: InferInput<KeySchema>,
      produce: () => MaybePromise<InferOutput<ValueSchema>>,
      optionsValue?: CacheOperationOptions,
    ) =>
      call(
        "getOrSet",
        async (context) =>
          required(provider.getOrSet, "getOrSet")(
            await parseKey(key),
            async () => parseValue(await produce()),
            ttl(optionsValue),
            context,
          ),
        (value) => parseValue(value) as Promise<unknown>,
      ),
    increment: (key: InferInput<KeySchema>, delta = 1, optionsValue?: CacheOperationOptions) =>
      call(
        "increment",
        async (context) => {
          const amount = validateIncrementDelta(delta);
          if (valueSchema !== undefined) {
            try {
              const zero = await parseValue(0);
              if (typeof zero !== "number") throw new CacheIncrementUnsupportedError();
            } catch (cause) {
              if (cause instanceof CacheIncrementUnsupportedError) throw cause;
              throw new CacheIncrementUnsupportedError();
            }
          }
          return required(provider.increment, "increment")(
            await parseKey(key),
            amount,
            ttl(optionsValue),
            context,
          );
        },
        async (value) => {
          const parsed = await parseValue(value);
          if (typeof parsed !== "number") throw new CacheIncrementUnsupportedError();
          return parsed;
        },
        "increment",
      ),
  };
  return Object.freeze(client) as CacheClient<InferInput<KeySchema>, InferOutput<ValueSchema>>;
}
