import {
  defineConnectionContract,
  defineIntegrationReference,
  defineLocalRecipeReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  isBindingValueRef,
  type BindingValueRef,
  type ProviderAdapter,
  type ProviderBehavior,
} from "@relkit/provider";

const cache = defineProviderCapability("cache");
export const redisIntegration = defineIntegrationReference("redis");
const atomicIncrement = defineProviderFeature(cache, "atomicIncrement");
export const redisConnectionContract = defineConnectionContract({
  url: { sensitive: true, authoredValue: "fallback" },
});
export const redisLocalRecipe = defineLocalRecipeReference(redisIntegration, "redis-docker", 1);

export type RedisUrlReference<Name extends string = string> = BindingValueRef<
  Name,
  string,
  "secret-string"
>;

export interface RedisOptions<
  Url extends RedisUrlReference | undefined = RedisUrlReference | undefined,
> {
  readonly url?: Url;
  readonly connectionTimeoutMs?: number;
}

export type RedisConnection<Options extends RedisOptions> = Options extends {
  readonly url: infer Url extends RedisUrlReference;
}
  ? Readonly<{ url: Url }>
  : Readonly<Record<never, never>>;

export type RedisBehavior<Options extends RedisOptions> = Options extends {
  readonly connectionTimeoutMs: infer Timeout extends number;
}
  ? Readonly<{ connectionTimeoutMs: Timeout }>
  : Readonly<Record<never, never>>;

export type RedisAdapter<Options extends RedisOptions = RedisOptions> = ProviderAdapter<
  typeof cache,
  "redis",
  RedisConnection<Options>,
  ProviderBehavior<RedisBehavior<Options>>
>;

/**
 * Defines a Redis-compatible cache adapter. Omit `url` for a deferred local or infrastructure source.
 *
 * @example
 * ```ts
 * import { env } from "@relkit/app/config";
 * import { redis } from "@relkit/redis";
 * const cache = redis({ url: env.secret("CACHE_URL") });
 * ```
 * @category Integrations
 * @since 0.2.0
 */
export function redis<const Options extends RedisOptions = RedisOptions>(
  options: Options = {} as Options,
): RedisAdapter<Options> {
  assertRedisOptions(options);
  const connection = options.url === undefined ? {} : { url: options.url };
  const behavior =
    options.connectionTimeoutMs === undefined
      ? {}
      : { connectionTimeoutMs: options.connectionTimeoutMs };
  return defineProviderAdapter({
    integration: redisIntegration,
    capability: cache,
    adapterId: "redis",
    connectionContract: redisConnectionContract,
    connection,
    behavior: defineProviderBehavior(behavior),
    features: [atomicIncrement],
    localRecipe: redisLocalRecipe,
  }) as RedisAdapter<Options>;
}

export function assertRedisOptions(options: RedisOptions): void {
  const value: unknown = options;
  if (!isRecord(value)) throw new TypeError("Redis options must be an object");
  const connectionTimeoutMs = options.connectionTimeoutMs;
  for (const key of Object.keys(options))
    if (key !== "url" && key !== "connectionTimeoutMs")
      throw new TypeError(`Unknown Redis option "${key}"`);
  if (
    options.url !== undefined &&
    (!isBindingValueRef(options.url) ||
      options.url.type !== "secret-string" ||
      options.url.sensitive !== true)
  ) {
    throw new TypeError("Redis url must be a named secret binding value");
  }
  if (
    connectionTimeoutMs !== undefined &&
    (!Number.isSafeInteger(connectionTimeoutMs) || connectionTimeoutMs < 1)
  ) {
    throw new RangeError("Redis connectionTimeoutMs must be a positive integer");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
