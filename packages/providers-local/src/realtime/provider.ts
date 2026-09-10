import type { RealtimeProvider, WaitForChannelEvents } from "@relkit/realtime";
import { appendEvent, lookupEventReceipt, readEvents } from "./events.js";
import { acquirePresence, readPresence, releasePresence, renewPresence } from "./presence.js";
import { createRealtimeStateStore } from "./storage.js";

export interface LocalRealtimeProviderOptions {
  readonly pollingMs?: number;
}

export function createLocalRealtimeProvider(
  root: string,
  options: LocalRealtimeProviderOptions = {},
): RealtimeProvider {
  const store = createRealtimeStateStore(root);
  const pollingMs = options.pollingMs ?? 250;
  return createRealtimeProviderFromStore(store, pollingMs);
}

export function createRealtimeProviderFromStore(
  store: ReturnType<typeof createRealtimeStateStore>,
  pollingMs = 250,
): RealtimeProvider {
  if (!Number.isInteger(pollingMs) || pollingMs < 50 || pollingMs > 1_000) {
    throw new RangeError("Realtime pollingMs must be between 50 and 1000.");
  }
  return Object.freeze<RealtimeProvider>({
    capabilities: {
      replay: "retained",
      presenceScope: "shared",
      durability: "filesystem",
    },
    getEpoch: async () => (await store.read()).providerEpoch,
    append: (request) => appendEvent(store, request),
    lookupAppendReceipt: (request) => lookupEventReceipt(store, request),
    readAfter: (request) => readEvents(store, request),
    waitAfter: (request) => waitAfter(store, request, pollingMs),
    readPresence: (request) => readPresence(store, request),
    acquirePresence: (request) => acquirePresence(store, request),
    renewPresence: (request) => renewPresence(store, request),
    releasePresence: (request) => releasePresence(store, request),
  });
}

async function waitAfter(
  store: ReturnType<typeof createRealtimeStateStore>,
  request: WaitForChannelEvents,
  pollingMs: number,
): Promise<void> {
  while (Date.now() < request.deadlineMs) {
    if (request.signal.aborted) throw request.signal.reason;
    const page = await readEvents(store, { ...request, limit: 1, maxEncodedBytes: 64 * 1024 });
    if (page.gap !== undefined || page.events.length > 0) return;
    await abortableSleep(Math.min(pollingMs, request.deadlineMs - Date.now()), request.signal);
  }
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, milliseconds));
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
