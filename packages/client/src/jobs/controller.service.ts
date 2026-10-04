import { Context, Effect, Layer, MutableRef, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { nativeCall } from "../native-stream.js";
import { runClient } from "../client-runtime.js";
import { freeze, notify, resumedOptions } from "./controller-support.js";
import { stateFromFeedEvent } from "./controller-state.js";
import { JobWatchAbortedError, JobWatchDisposedError } from "./types.js";
import type { JobWatchListener, JobWatchOptions, JobWatchState } from "./types.js";
import { JobFeedRegistry } from "./feed-registry.service.js";
import type { JobFeedRegistryService, WatchFeedBorrow } from "./feed-registry.types.js";
import type { FeedEvent } from "./watch-feed.types.js";
import type { JobControllerFactory, JobControllerView } from "./controller.service.types.js";

/** Creates passive external-store views over scoped physical observation services. */
export class JobControllers extends Context.Service<JobControllers, JobControllerFactory>()(
  "@relkit/client/JobControllers",
) {}

let nextControllerId = 1;

/** Acquires the controller factory once without opening native requests.
 * @returns A resource-free factory Layer requiring the complete-key feed registry.
 * @example
 * ```ts
 * import { Layer, ManagedRuntime } from "effect";
 * import { runExecutionSync } from "@relkit/contracts/operation";
 * import { JobControllers, JobControllersLive } from "./controller.service.js";
 * import { JobFeedRegistryLive } from "./feed-registry.service.js";
 * export async function observeJob(client: unknown): Promise<void> {
 *   const owner = ManagedRuntime.make(JobControllersLive.pipe(Layer.provide(JobFeedRegistryLive)));
 *   try {
 *     const factory = runExecutionSync(owner, JobControllers);
 *     const view = factory.view(client, "job", { runId: "run" });
 *     try { await view.connect(); } finally { await view.dispose(); }
 *   } finally { await owner.dispose(); }
 * }
 * ```
 */
export const JobControllersLive = Layer.effect(
  JobControllers,
  Effect.gen(function* () {
    const registry = yield* JobFeedRegistry;
    return JobControllers.of({
      view: (client, name, options) => createView(registry, client, name, options),
    });
  }),
);

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
  const state = Ref.makeUnsafe<JobWatchState<unknown>>(
    freeze({ connection: "idle", isStale: false }),
  );
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
  const snapshot = (): JobWatchState<unknown> => Ref.getUnsafe(state);
  const assertLive = (): void => {
    if (disposed) throw new JobWatchDisposedError();
  };
  /** Publishes one pure external-store transformation.
   * @param value - Next immutable view state.
   * @returns Nothing after isolated synchronous callbacks. */
  const publish = (value: JobWatchState<unknown>): void => {
    const frozen = freeze(value);
    MutableRef.set(state.ref, frozen);
    for (const listener of listeners) notify(listener, frozen);
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
  /** Delegates an authoritative read to the interruptible domain workflow.
   * @returns The original read result or rejection after temporary borrow cleanup. */
  const refetch = (): Promise<void> => {
    assertLive();
    refetchAbort?.abort();
    const controller = new AbortController();
    refetchAbort = controller;
    const requestedEpoch = epoch;
    const work = runClient(
      observeExecution(
        "client",
        "jobs.refetch",
        Effect.fn("JobControllers.refetch")(function* () {
          const previousConnection = snapshot().connection;
          yield* Effect.acquireUseRelease(
            borrow === undefined
              ? registry.borrow(client, name, resumedOptions(options, snapshot()))
              : Effect.succeed(undefined),
            (temporary) =>
              Effect.gen(function* () {
                const current = borrow ?? temporary!;
                const frame = yield* nativeCall((owned) =>
                  current.feed.refetch(AbortSignal.any([controller.signal, owned])),
                );
                if (frame === undefined || controller.signal.aborted || disposed) return;
                receive({ kind: "frame", frame }, requestedEpoch);
                if (disconnected && previousConnection === "disconnected")
                  publish({ ...snapshot(), connection: "disconnected" });
              }),
            (temporary) => temporary?.release ?? Effect.void,
          ).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (refetchAbort === controller) refetchAbort = undefined;
              }),
            ),
          );
        })(),
      ),
      controller.signal,
    );
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
