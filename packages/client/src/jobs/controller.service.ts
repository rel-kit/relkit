import { abortable } from "../native/iterate.js";
import { freeze, notify, resumedOptions } from "./controller-support.js";
import { stateFromFeedEvent } from "./controller-state.js";
import { JobWatchAbortedError, JobWatchDisposedError } from "./types.js";
import type { JobWatchListener, JobWatchOptions, JobWatchState } from "./types.js";
import type { JobFeedRegistryService, WatchFeedBorrow } from "./feed-registry.types.js";
import type { FeedEvent } from "./watch-feed.types.js";
import type { JobControllerFactory, JobControllerView } from "./controller.service.types.js";

let nextControllerId = 1;

/** Creates the controller factory without opening native requests.
 * @param registry - Complete-key physical feed registry shared by every view.
 * @returns A resource-free factory of passive external-store views.
 * @example
 * ```ts
 * import { createJobControllers } from "./controller.service.js";
 * import { createJobFeedRegistry } from "./feed-registry.service.js";
 * export async function connectOnce(client: Parameters<ReturnType<typeof createJobControllers>["view"]>[0]) {
 *   const factory = createJobControllers(createJobFeedRegistry());
 *   const view = factory.view(client, "job", { runId: "run" });
 *   try { await view.connect(); } finally { await view.dispose(); }
 * }
 * ```
 */
export function createJobControllers(registry: JobFeedRegistryService): JobControllerFactory {
  return { view: (client, name, options) => createView(registry, client, name, options) };
}

/** Allocates a passive view of authoritative observation state.
 * @param registry - Once-acquired physical feed registry.
 * @param client - Borrowed transport identity.
 * @param name - Declared job identity.
 * @param options - Complete security and observation policy.
 * @returns A synchronous view whose retirement releases its native lease. */
function createView(
  registry: JobFeedRegistryService,
  client: unknown,
  name: string,
  options: JobWatchOptions,
): JobControllerView {
  let state: JobWatchState<unknown> = freeze({ connection: "idle", isStale: false });
  const listeners = new Set<JobWatchListener<unknown>>();
  const id = `watch-${nextControllerId++}`;
  let borrow: WatchFeedBorrow | undefined;
  let leaseId: string | undefined;
  let epoch = 0;
  let disconnected = false;
  let disposed = false;
  let closing: Promise<void> | undefined;
  let refetchAbort: AbortController | undefined;
  const refetches = new Set<Promise<void>>();
  const snapshot = (): JobWatchState<unknown> => state;
  const assertLive = (): void => {
    if (disposed) throw new JobWatchDisposedError();
  };
  /** Publishes one pure external-store transformation.
   * @param value - Next immutable view state.
   * @returns Nothing after isolated synchronous callbacks. */
  const publish = (value: JobWatchState<unknown>): void => {
    state = freeze(value);
    for (const listener of listeners) notify(listener, state);
  };
  /** Accepts publication only while this view retains its epoch.
   * @param event - Frame or status supplied by the scoped observation.
   * @param requestedEpoch - View generation at lease registration.
   * @returns Nothing after stale callback filtering. */
  const receive = (event: FeedEvent<unknown>, requestedEpoch: number): void => {
    if (requestedEpoch === epoch && !disposed)
      publish(stateFromFeedEvent(snapshot(), event, options.source));
  };
  /** Removes lookup authority before native callbacks can reconnect.
   * @param error - Original pending first-snapshot rejection.
   * @returns Joined physical cleanup for a final view, otherwise immediate completion. */
  const release = (error: unknown): Promise<void> => {
    const previous = borrow;
    const previousLease = leaseId;
    borrow = undefined;
    leaseId = undefined;
    if (previous === undefined || previousLease === undefined) return Promise.resolve();
    previous.retireView();
    const teardown = previous.feed.removeLease(previousLease, error);
    return previous.feed.hasLeases
      ? previous.releaseView()
      : teardown.finally(previous.releaseView);
  };
  /** Binds this passive view to an existing or new scoped physical feed.
   * @returns The native observation's first-snapshot settlement. */
  const start = (): Promise<void> => {
    const requestedEpoch = ++epoch;
    disconnected = false;
    publish({
      ...snapshot(),
      connection: "connecting",
      isStale: false,
      connectionError: undefined,
    });
    if (requestedEpoch !== epoch || disposed || disconnected)
      return Promise.reject(new JobWatchAbortedError());
    const current = registry.borrowView(client, name, resumedOptions(options, snapshot()));
    if (requestedEpoch !== epoch || disposed || disconnected)
      return current.releaseView().then(() => {
        throw new JobWatchAbortedError();
      });
    const currentLease = `${id}:${requestedEpoch}`;
    borrow = current;
    leaseId = currentLease;
    return current.feed
      .addLease(currentLease, (event) => receive(event, requestedEpoch))
      .catch((error) => {
        if (
          requestedEpoch === epoch &&
          !disposed &&
          !disconnected &&
          snapshot().connection !== "unauthorized"
        )
          publish({ ...snapshot(), connection: "error", isStale: false, connectionError: error });
        throw error;
      });
  };
  /** Reads authoritative state through the bound feed, or a temporary borrow when idle.
   * @returns The original read result or rejection after temporary borrow cleanup. */
  const refetch = (): Promise<void> => {
    assertLive();
    refetchAbort?.abort();
    const controller = new AbortController();
    refetchAbort = controller;
    const requestedEpoch = epoch;
    const previousConnection = snapshot().connection;
    const work = (async () => {
      let temporary: WatchFeedBorrow | undefined;
      try {
        if (borrow === undefined)
          temporary = registry.borrowView(client, name, resumedOptions(options, snapshot()));
        const current = borrow ?? temporary!;
        const frame = await abortable(current.feed.refetch(controller.signal), controller.signal);
        if (frame === undefined || controller.signal.aborted || disposed) return;
        receive({ kind: "frame", frame }, requestedEpoch);
        if (disconnected && previousConnection === "disconnected")
          publish({ ...snapshot(), connection: "disconnected" });
      } finally {
        await temporary?.releaseView();
        if (refetchAbort === controller) refetchAbort = undefined;
      }
    })();
    const tracked = work.finally(() => {
      refetches.delete(tracked);
    });
    refetches.add(tracked);
    return tracked;
  };
  return {
    snapshot,
    assertLive,
    isDisconnected: () => disconnected,
    subscribe: (listener) => {
      listeners.add(listener);
      notify(listener, snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    connect: () => {
      assertLive();
      const connection = snapshot().connection;
      if (
        connection === "connected" ||
        connection === "connecting" ||
        connection === "reconnecting"
      )
        return Promise.resolve();
      const requestedEpoch = epoch;
      const resume = (): Promise<void> => {
        if (snapshot().connection === "completed" || requestedEpoch !== epoch || disposed)
          return Promise.resolve();
        if (borrow !== undefined)
          return release(new JobWatchAbortedError()).then(() =>
            requestedEpoch === epoch && !disposed ? start() : undefined,
          );
        return start();
      };
      return connection === "completed" ? refetch().then(resume) : resume();
    },
    disconnect: () => {
      if (disposed) return Promise.resolve();
      disconnected = true;
      epoch++;
      refetchAbort?.abort();
      publish({
        ...snapshot(),
        connection: "disconnected",
        isStale: false,
        connectionError: undefined,
      });
      return release(new JobWatchAbortedError());
    },
    dispose: () => {
      if (closing !== undefined) return closing;
      disposed = true;
      epoch++;
      refetchAbort?.abort();
      return (closing = Promise.allSettled([
        ...refetches,
        release(new JobWatchAbortedError()),
      ]).then(() => {
        publish({ connection: "disposed", isStale: false });
        listeners.clear();
      }));
    },
    refetch,
  };
}
