import {
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  type ProviderAdapter,
  type ProviderBehavior,
} from "@relkit/provider";
import {
  assertRedisOptions,
  redisConnectionContract,
  redisIntegration,
  redisLocalRecipe,
  type RedisBehavior,
  type RedisConnection,
  type RedisOptions,
} from "./redis.js";

const realtime = defineProviderCapability("realtime");
const agentState = defineProviderCapability("agent-state");

export type RedisRealtimeAdapter<Options extends RedisOptions = RedisOptions> = ProviderAdapter<
  typeof realtime,
  "redis-realtime",
  RedisConnection<Options>,
  ProviderBehavior<RedisBehavior<Options>>
>;

export type RedisAgentStateAdapter<Options extends RedisOptions = RedisOptions> = ProviderAdapter<
  typeof agentState,
  "redis-agent-state",
  RedisConnection<Options>,
  ProviderBehavior<RedisBehavior<Options>>
>;

export function redisRealtime<const Options extends RedisOptions = RedisOptions>(
  options: Options = {} as Options,
): RedisRealtimeAdapter<Options> {
  return adapter(realtime, "redis-realtime", options) as RedisRealtimeAdapter<Options>;
}

export function redisAgentState<const Options extends RedisOptions = RedisOptions>(
  options: Options = {} as Options,
): RedisAgentStateAdapter<Options> {
  return adapter(agentState, "redis-agent-state", options) as RedisAgentStateAdapter<Options>;
}

function adapter(
  capability: typeof realtime | typeof agentState,
  adapterId: "redis-realtime" | "redis-agent-state",
  options: RedisOptions,
): ProviderAdapter {
  assertRedisOptions(options);
  return defineProviderAdapter({
    integration: redisIntegration,
    capability,
    adapterId,
    connectionContract: redisConnectionContract,
    connection: options.url === undefined ? {} : { url: options.url },
    behavior: defineProviderBehavior(
      options.connectionTimeoutMs === undefined
        ? {}
        : { connectionTimeoutMs: options.connectionTimeoutMs },
    ),
    localRecipe: redisLocalRecipe,
  });
}
