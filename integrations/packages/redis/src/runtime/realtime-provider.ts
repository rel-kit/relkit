import type { RealtimeProvider, WaitForChannelEvents } from "@relkit/realtime";
import {
  createRealtimeProviderFromStore,
  emptyRealtimeState,
  LOCAL_REALTIME_STATE_VERSION,
} from "@relkit/providers-local";
import { createRedisRealtimeStore } from "./state-store.js";

export interface RedisRealtimeProviderOptions {
  readonly url: string;
  readonly profile: string;
  readonly connectionTimeoutMs?: number;
}

export function createRedisRealtimeProvider(
  options: RedisRealtimeProviderOptions,
): RealtimeProvider & { ready(): Promise<void>; close(): Promise<void> } {
  const store = createRedisRealtimeStore({
    ...options,
    key: `relkit:realtime:${encodeURIComponent(options.profile)}`,
    empty: emptyRealtimeState,
    valid: (value): value is ReturnType<typeof emptyRealtimeState> =>
      isRecord(value) && value.version === LOCAL_REALTIME_STATE_VERSION,
  });
  const base = createRealtimeProviderFromStore(store);
  return Object.freeze({
    ...base,
    capabilities: {
      replay: "retained",
      presenceScope: "shared",
      durability: "redis-configured",
    } as const,
    waitAfter: (request: WaitForChannelEvents) => waitAfter(base, store, request),
    ready: store.ready,
    close: store.close,
  });
}

async function waitAfter(
  provider: RealtimeProvider,
  store: ReturnType<typeof createRedisRealtimeStore>,
  request: WaitForChannelEvents,
): Promise<void> {
  await store.waitForChange(
    async () => {
      const page = await provider.readAfter({
        ...request,
        limit: 1,
        maxEncodedBytes: 64 * 1024,
      });
      return page.gap !== undefined || page.events.length > 0;
    },
    request.deadlineMs,
    request.signal,
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
