/**
 * Realtime on a Durable Object: RelKit's shared realtime logic over a state store whose document
 * lives in one `RelkitRealtimeState` object per profile, so every isolate of the Worker sees the same
 * channels, retained events and presence, and subscribers wait on the object instead of polling.
 */
import type { RealtimeProvider, WaitForChannelEvents } from "relkit/realtime";
import {
  createRealtimeProviderFromStore,
  emptyRealtimeState,
  LOCAL_REALTIME_STATE_VERSION,
  type LocalRealtimeState,
  type RealtimeStateStore,
} from "relkit/providers-local";
import { workersBinding } from "relkit/runtime/workers";

/** The Durable Object namespace methods the provider uses. @experimental */
export interface DurableObjectNamespaceBinding {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

/** Options of `createDurableObjectRealtimeProvider`. @experimental */
export interface DurableObjectRealtimeOptions {
  /** Binding of the `RelkitRealtimeState` namespace. */
  readonly binding: string;
  readonly profile: string;
  /** Namespace to use instead of the Worker's binding, for tests. */
  readonly namespace?: DurableObjectNamespaceBinding;
}

/**
 * Creates the realtime provider for one profile.
 * @param options - Binding and profile.
 * @returns The provider with its readiness check and close.
 * @experimental
 */
export function createDurableObjectRealtimeProvider(
  options: DurableObjectRealtimeOptions,
): RealtimeProvider & { ready(): Promise<void>; close(): Promise<void> } {
  let closed = false;
  const call = async (path: string, body: object): Promise<Readonly<Record<string, unknown>>> => {
    if (closed) throw new Error("Durable Object realtime provider is closed.");
    const namespace =
      options.namespace ?? workersBinding<DurableObjectNamespaceBinding>(options.binding);
    const object = namespace.get(namespace.idFromName(`relkit:realtime:${options.profile}`));
    const response = await object.fetch(`https://relkit-realtime${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Durable Object realtime ${path} failed: ${response.status}`);
    return (await response.json()) as Readonly<Record<string, unknown>>;
  };
  const readText = async (): Promise<string> => {
    const value = (await call("/read", {})).value;
    if (typeof value === "string") return value;
    await call("/compare-and-set", { expected: null, next: JSON.stringify(emptyRealtimeState()) });
    const created = (await call("/read", {})).value;
    if (typeof created !== "string") throw new Error("Durable Object realtime state is missing.");
    return created;
  };
  const parse = (text: string): LocalRealtimeState => {
    const value = JSON.parse(text) as LocalRealtimeState;
    if (value?.version !== LOCAL_REALTIME_STATE_VERSION)
      throw new TypeError("Durable Object realtime state is invalid.");
    return value;
  };
  const store: RealtimeStateStore = {
    read: async () => parse(await readText()),
    update: async (change) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const current = await readText();
        const result = change(parse(current));
        const next = JSON.stringify(result.state);
        if ((await call("/compare-and-set", { expected: current, next })).committed === true)
          return result.value;
      }
      throw new Error("Durable Object realtime state update kept conflicting.");
    },
  };
  const base = createRealtimeProviderFromStore(store);
  const waitAfter = async (request: WaitForChannelEvents): Promise<void> => {
    const due = async () => {
      const page = await base.readAfter({ ...request, limit: 1, maxEncodedBytes: 64 * 1024 });
      return page.gap !== undefined || page.events.length > 0;
    };
    while (!request.signal.aborted && Date.now() < request.deadlineMs) {
      const expected = await readText();
      if (await due()) return;
      await call("/wait", { expected, deadlineMs: request.deadlineMs });
      if (await due()) return;
    }
    if (request.signal.aborted) throw request.signal.reason;
  };
  return Object.freeze({
    ...base,
    capabilities: {
      replay: "retained",
      presenceScope: "shared",
      durability: "durable-object",
    } as const,
    waitAfter,
    ready: async () => {
      await readText();
    },
    close: async () => {
      closed = true;
    },
  });
}
