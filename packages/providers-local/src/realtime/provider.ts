import type { RealtimeProvider, WaitForChannelEvents } from "@relkit/realtime";
import { Clock, Context, Effect, Layer } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  runLocal,
  runLocalSync,
} from "../local-effect.js";
import { appendEvent, lookupEventReceipt, readEvents } from "./events.js";
import { acquirePresence, readPresence, releasePresence, renewPresence } from "./presence.js";
import {
  makeRealtimeStateStore,
  type RealtimeStateStore,
  type RealtimeStateStoreEffects,
} from "./storage.js";
import type { RealtimeEffects, LocalRealtimeProviderOptions } from "./provider.types.js";
export type { LocalRealtimeProviderOptions } from "./provider.types.js";

/** Realtime operations sharing one persisted-state transaction owner. */
export class LocalRealtimeService extends Context.Service<LocalRealtimeService, RealtimeEffects>()(
  "@relkit/providers-local/Realtime",
) {}

/**
 * Provides realtime operations using filesystem-shared state.
 * @param root - Owned realtime state directory.
 * @param options - Observation interval configuration.
 * @returns The compatible Promise provider.
 */
export function createLocalRealtimeProvider(
  root: string,
  options: LocalRealtimeProviderOptions = {},
): RealtimeProvider {
  return promiseProvider(
    makeRealtimeService(runLocalSync(makeRealtimeStateStore(root)), options.pollingMs),
  );
}

/**
 * Substitutes an existing Promise storage adapter at the compatibility edge.
 * @param store - Third-party or fault-injecting transaction implementation.
 * @param pollingMs - Shared-state observation interval.
 * @returns The compatible realtime provider.
 */
export function createRealtimeProviderFromStore(
  store: RealtimeStateStore,
  pollingMs = 250,
): RealtimeProvider {
  return promiseProvider(
    makeRealtimeService(
      {
        read: () => localPromise(() => store.read()),
        update: (change) => localPromise(() => store.update(change)),
      },
      pollingMs,
    ),
  );
}

/**
 * Builds one live realtime service through a substitutable layer.
 * @param root - Owned realtime directory.
 * @param pollingMs - Polling interval in milliseconds.
 * @returns The live realtime layer.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalRealtimeService, realtimeLayer } from "./provider.js";
 *
 * const program = Effect.gen(function* () {
 *   const realtime = yield* LocalRealtimeService;
 *     return yield* realtime.getEpoch();
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(realtimeLayer("/tmp/example-realtime"))));
 * ```
 */
export function realtimeLayer(root: string, pollingMs = 250) {
  return Layer.effect(
    LocalRealtimeService,
    Effect.map(makeRealtimeStateStore(root), (store) => makeRealtimeService(store, pollingMs)),
  );
}

/**
 * Composes realtime behavior over an Effect transaction interface.
 * @param store - Atomic snapshot operations.
 * @param pollingMs - Polling interval, from 50 through 1000 milliseconds.
 * @returns The complete substitutable service implementation.
 */
export function makeRealtimeService(
  store: RealtimeStateStoreEffects,
  pollingMs = 250,
): RealtimeEffects {
  if (!Number.isInteger(pollingMs) || pollingMs < 50 || pollingMs > 1000)
    throw new RangeError("Realtime pollingMs must be between 50 and 1000.");
  return LocalRealtimeService.of({
    getEpoch: () =>
      localOperation(
        "Realtime.getEpoch",
        Effect.map(store.read(), (state) => state.providerEpoch),
      ),
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

/**
 * Observes persisted state until an event, gap, deadline or interruption.
 * @param store - Shared persisted state.
 * @param request - Cursor, deadline and cancellation context.
 * @param pollingMs - Maximum interval between reads.
 * @returns A lazy observation effect; interruption cancels its pending sleep.
 */
const waitAfter = Effect.fn("Realtime.waitAfter")(
  function* (store: RealtimeStateStoreEffects, request: WaitForChannelEvents, pollingMs: number) {
    while ((yield* Clock.currentTimeMillis) < request.deadlineMs) {
      yield* localSync(() => {
        if (request.signal.aborted) throw request.signal.reason;
      });
      const page = yield* readEvents(store, { ...request, limit: 1, maxEncodedBytes: 64 * 1024 });
      if (page.gap !== undefined || page.events.length > 0) return;
      yield* Effect.sleep(
        Math.max(0, Math.min(pollingMs, request.deadlineMs - (yield* Clock.currentTimeMillis))),
      );
    }
  },
  (effect) => localOperation("Realtime.waitAfter", effect),
);

/**
 * Executes owning effects at the existing Promise interface.
 * @param service - Once-built service implementation.
 * @returns A provider retaining capabilities and cancellation semantics.
 */
function promiseProvider(service: RealtimeEffects): RealtimeProvider {
  return Object.freeze<RealtimeProvider>({
    capabilities: { replay: "retained", presenceScope: "shared", durability: "filesystem" },
    getEpoch: () => runLocal(service.getEpoch()),
    append: (request) => runLocal(service.append(request)),
    lookupAppendReceipt: (request) => runLocal(service.lookupAppendReceipt(request)),
    readAfter: (request) => runLocal(service.readAfter(request)),
    waitAfter: (request) => runLocal(service.waitAfter(request), request.signal),
    readPresence: (request) => runLocal(service.readPresence(request)),
    acquirePresence: (request) => runLocal(service.acquirePresence(request)),
    renewPresence: (request) => runLocal(service.renewPresence(request)),
    releasePresence: (request) => runLocal(service.releasePresence(request)),
  });
}
