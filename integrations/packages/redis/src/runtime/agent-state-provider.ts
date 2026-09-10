import type {
  AgentStateProvider,
  WaitForControlsRequest,
  WaitForJournalRequest,
} from "@relkit/agents";
import {
  createAgentStateProviderFromStore,
  emptyAgentState,
  LOCAL_AGENT_STATE_VERSION,
} from "@relkit/providers-local";
import { createRedisAgentStore } from "./state-store.js";

export interface RedisAgentStateProviderOptions {
  readonly url: string;
  readonly profile: string;
  readonly connectionTimeoutMs?: number;
}

export function createRedisAgentStateProvider(
  options: RedisAgentStateProviderOptions,
): AgentStateProvider & { ready(): Promise<void>; close(): Promise<void> } {
  const store = createRedisAgentStore({
    ...options,
    key: `relkit:agent-state:${encodeURIComponent(options.profile)}`,
    empty: emptyAgentState,
    valid: (value): value is ReturnType<typeof emptyAgentState> =>
      isRecord(value) && value.version === LOCAL_AGENT_STATE_VERSION,
  });
  const base = createAgentStateProviderFromStore(store);
  return Object.freeze({
    ...base,
    waitForJournal: (request: WaitForJournalRequest) => waitForJournal(base, store, request),
    waitForControls: (request: WaitForControlsRequest) => waitForControls(base, store, request),
    ready: store.ready,
    close: store.close,
  });
}

function waitForJournal(
  provider: AgentStateProvider,
  store: ReturnType<typeof createRedisAgentStore>,
  request: WaitForJournalRequest,
): Promise<void> {
  return store.waitForChange(
    async () => {
      const page = await provider.readJournal({
        ...request,
        limit: 1,
        maxEncodedBytes: 256 * 1024,
      });
      return page.gap !== undefined || page.records.length > 0;
    },
    request.deadlineMs,
    request.signal,
  );
}

function waitForControls(
  provider: AgentStateProvider,
  store: ReturnType<typeof createRedisAgentStore>,
  request: WaitForControlsRequest,
): Promise<void> {
  return store.waitForChange(
    async () => (await provider.readControls({ ...request, limit: 1 })).operationIds.length > 0,
    request.deadlineMs,
    request.signal,
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
