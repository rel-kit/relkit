import type {
  AgentStateStore,
  LocalAgentState,
  LocalRealtimeState,
  RealtimeStateStore,
} from "@relkit/providers-local";
import { createRedisClient, type RedisProtocolClient } from "./client.js";

export interface RedisStateStoreOptions<State> {
  readonly url: string;
  readonly key: string;
  readonly empty: () => State;
  readonly valid: (state: unknown) => state is State;
  readonly connectionTimeoutMs?: number;
}

export interface RedisStateWaiter {
  waitForChange(
    recheck: () => Promise<boolean>,
    deadlineMs: number,
    signal: AbortSignal,
  ): Promise<void>;
  ready(): Promise<void>;
  close(): Promise<void>;
}

export type RedisRealtimeStore = RealtimeStateStore & RedisStateWaiter;
export type RedisAgentStore = AgentStateStore & RedisStateWaiter;

export function createRedisRealtimeStore(
  options: RedisStateStoreOptions<LocalRealtimeState>,
): RedisRealtimeStore {
  const core = createCore(options);
  return {
    ...core.lifecycle,
    read: core.read,
    update: (change) =>
      core.update((state) => {
        const result = change(state);
        return [result.state, result.value] as const;
      }),
  };
}

export function createRedisAgentStore(
  options: RedisStateStoreOptions<LocalAgentState>,
): RedisAgentStore {
  const core = createCore(options);
  return { ...core.lifecycle, read: core.read, update: core.update };
}

function createCore<State>(options: RedisStateStoreOptions<State>) {
  const client = createRedisClient(options);
  const streamKey = `${options.key}:notifications`;
  let closed = false;
  const connect = async (): Promise<RedisProtocolClient> => {
    if (closed) throw new Error("Redis state provider is closed.");
    if (!client.connected) await client.connect();
    return client;
  };
  const readRaw = async (redis: RedisProtocolClient): Promise<string> => {
    let value = await redis.get(options.key);
    if (value === null) {
      await redis.command("SET", [options.key, JSON.stringify(options.empty()), "NX"]);
      value = await redis.get(options.key);
    }
    if (value === null) throw new Error("Redis Relkit state initialization failed.");
    return value;
  };
  const parse = (value: string): State => {
    const parsed: unknown = JSON.parse(value);
    if (!options.valid(parsed)) throw new TypeError("Redis Relkit state is invalid.");
    return parsed;
  };
  const read = async (): Promise<State> => parse(await readRaw(await connect()));
  const update = async <Value>(
    change: (state: State) => readonly [State, Value],
  ): Promise<Value> => {
    const redis = await connect();
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const current = await readRaw(redis);
      const [next, value] = change(parse(current));
      const committed = await redis.command("EVAL", [
        compareAndSetScript,
        "2",
        options.key,
        streamKey,
        current,
        JSON.stringify(next),
      ]);
      if (Number(committed) === 1) return value;
      await Bun.sleep(10);
    }
    throw new Error("Redis Relkit state update timed out.");
  };
  const lifecycle: RedisStateWaiter = {
    ready: async () => {
      if (!(await (await connect()).ping())) throw new Error("Redis state readiness failed.");
      await read();
    },
    close: async () => {
      closed = true;
      client.close();
    },
    waitForChange: (recheck, deadlineMs, signal) =>
      waitForChange(options, streamKey, recheck, deadlineMs, signal),
  };
  return { read, update, lifecycle };
}

const compareAndSetScript = [
  "if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end",
  "redis.call('set', KEYS[1], ARGV[2])",
  "redis.call('xadd', KEYS[2], 'MAXLEN', '~', '10000', '*', 'changed', '1')",
  "return 1",
].join("\n");

async function waitForChange<State>(
  options: RedisStateStoreOptions<State>,
  streamKey: string,
  recheck: () => Promise<boolean>,
  deadlineMs: number,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted && Date.now() < deadlineMs) {
    const client = createRedisClient(options);
    const abort = (): void => client.close();
    signal.addEventListener("abort", abort, { once: true });
    try {
      await client.connect();
      const tail = await client.command("XREVRANGE", [streamKey, "+", "-", "COUNT", "1"]);
      const id = Array.isArray(tail) && Array.isArray(tail[0]) ? String(tail[0][0]) : "$";
      if (await recheck()) return;
      const block = Math.min(1_000, Math.max(1, deadlineMs - Date.now()));
      await client.command("XREAD", [
        "BLOCK",
        String(block),
        "COUNT",
        "1",
        "STREAMS",
        streamKey,
        id,
      ]);
      if (await recheck()) return;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      await Bun.sleep(Math.min(250, Math.max(0, deadlineMs - Date.now())));
      void error;
    } finally {
      signal.removeEventListener("abort", abort);
      client.close();
    }
  }
  if (signal.aborted) throw signal.reason;
}
