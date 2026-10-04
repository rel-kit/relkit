import { Context, Effect, Fiber, Layer, Ref, Scope, Stream } from "effect";
import type { ClientIdentityDocument } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { nativeStream } from "../native-stream.js";
import { procedureCall } from "./procedure.js";
import { realtimeSubscriptionKey } from "./realtime-session-key.js";
import type {
  RealtimeFrame,
  RealtimeSessionService,
  RealtimeStatus,
  SharedSubscription,
} from "./realtime-manager.types.js";

/** One manager's sharing registry, checkpoints and reconnect workers. */
export class RealtimeSessions extends Context.Service<RealtimeSessions, RealtimeSessionService>()(
  "relkit/client/RealtimeSessions",
) {}

/**
 * Acquires one synchronous registry with scoped, lazy native workers.
 * @param client - Borrowed transport, replaceable by a deterministic test client.
 * @param identity - Manager-local authorization/session boundary.
 * @returns A Layer whose Scope interrupts and joins every active connection.
 * @example
 * ```ts
 * import { ManagedRuntime } from "effect";
 * import { runExecutionSync } from "@relkit/contracts/operation";
 * import { RealtimeSessions, realtimeSessionsLayer } from "./realtime-session.service.js";
 * export async function realtimeOwner(): Promise<void> {
 *   const owner = ManagedRuntime.make(realtimeSessionsLayer({}));
 *   try { const sessions = runExecutionSync(owner, RealtimeSessions); }
 *   finally { await owner.dispose(); }
 * }
 * ```
 * @see packages/client/tests/transport/examples.test.ts for the checked live Layer example.
 */
export function realtimeSessionsLayer(
  client: unknown,
  identity?: Pick<ClientIdentityDocument, "identityScope" | "sessionEpoch">,
): Layer.Layer<RealtimeSessions> {
  return Layer.effect(
    RealtimeSessions,
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const state = yield* Ref.make<RealtimeStatus>("idle");
      const feeds = new Map<string, SharedSubscription>();
      const statusListeners = new Set<() => void>();
      let stopped = false;
      /** Publishes manager state only when its frozen status changes.
       * @param status - The next manager state.
       * @returns Safe external-store notification. */
      const setStatus = Effect.fn("RealtimeSessions.status")((status: RealtimeStatus) =>
        Effect.gen(function* () {
          if ((yield* Ref.get(state)) === status) return;
          yield* Ref.set(state, status);
          for (const listener of statusListeners) safely(listener);
        }),
      );
      /** Publishes connection status to both manager and channel observers.
       * @param shared - Current scoped connection.
       * @param status - Its next native lifecycle state.
       * @returns Observer notifications isolated from the worker. */
      const report = Effect.fn("RealtimeSessions.report")(
        (shared: SharedSubscription, status: RealtimeStatus) =>
          Effect.gen(function* () {
            yield* setStatus(status);
            if (shared.status === status) return;
            shared.status = status;
            for (const listener of shared.statusListeners) safely(() => listener(status));
          }),
      );
      /** Pulls ordered frames with no intermediate buffer and owns reconnect sleeps.
       * @param key - Complete manager-local sharing key.
       * @param channel - Declared channel name.
       * @param params - Borrowed channel parameters.
       * @param shared - Current connection, checkpoint and cancellation owner.
       * @returns Scoped connection work until the final borrower releases it. */
      const consume = Effect.fn("RealtimeSessions.consume")(
        (key: string, channel: string, params: unknown, shared: SharedSubscription) =>
          observeExecution(
            "client",
            "realtime.session",
            Effect.gen(function* () {
              while (!shared.controller.signal.aborted && feeds.get(key) === shared) {
                yield* report(shared, "connecting");
                const source = nativeStream<RealtimeFrame>(
                  "realtime.frames",
                  async (signal) => {
                    const stream = await procedureCall(client, "relkit.realtime.subscribe")(
                      {
                        channel,
                        params,
                        after: shared.checkpoint,
                        ...(identity === undefined ? {} : { expectedIdentity: identity }),
                      },
                      { signal },
                    );
                    return (stream as AsyncIterable<RealtimeFrame>)[Symbol.asyncIterator]();
                  },
                  shared.controller.signal,
                  report(shared, "connected"),
                );
                // Zero buffer: process each pull before asking for another frame.
                yield* Stream.runForEach(source, (frame) =>
                  Effect.sync(() => {
                    if (shared.controller.signal.aborted || feeds.get(key) !== shared) return;
                    if ("checkpoint" in frame) shared.checkpoint = frame.checkpoint;
                    for (const listener of shared.listeners) safely(() => listener(frame));
                  }),
                ).pipe(
                  Effect.andThen(report(shared, "stale")),
                  Effect.catch(() =>
                    shared.controller.signal.aborted ? Effect.void : report(shared, "error"),
                  ),
                );
                if (!shared.controller.signal.aborted) yield* Effect.sleep(250);
              }
            }),
          ),
      );
      /** Retires every shared connection before manager scope interruption.
       * @returns Synchronous cancellation initiation and idle publication. */
      const stop = Effect.fn("RealtimeSessions.stop")(() =>
        Effect.gen(function* () {
          stopped = true;
          for (const shared of feeds.values()) shared.controller.abort();
          feeds.clear();
          yield* setStatus("idle");
        }),
      );
      yield* Effect.addFinalizer(() => stop());
      return RealtimeSessions.of({
        feeds,
        statusListeners,
        snapshot: () => Ref.get(state),
        stop,
        subscribe: Effect.fn("RealtimeSessions.subscribe")(
          (channel, params, listener, statusListener) =>
            Effect.gen(function* () {
              if (stopped) throw new Error("Realtime manager is disposed.");
              const key = realtimeSubscriptionKey(channel, params);
              let shared = feeds.get(key);
              let created = false;
              if (shared === undefined) {
                shared = {
                  controller: new AbortController(),
                  listeners: new Set(),
                  statusListeners: new Set(),
                  status: "connecting",
                };
                feeds.set(key, shared);
                created = true;
              }
              const entry = shared;
              entry.listeners.add(listener);
              if (statusListener !== undefined) {
                entry.statusListeners.add(statusListener);
                safely(() => statusListener(entry.status));
              }
              if (created)
                entry.fiber = yield* consume(key, channel, params, entry).pipe(
                  Effect.forkIn(scope),
                );
              let released = false;
              return Effect.gen(function* () {
                if (released) return;
                released = true;
                entry.listeners.delete(listener);
                if (statusListener !== undefined) entry.statusListeners.delete(statusListener);
                if (entry.listeners.size !== 0) return;
                entry.controller.abort();
                feeds.delete(key);
                // Initiate interruption synchronously; the owner joins this cleanup fiber.
                if (entry.fiber !== undefined)
                  yield* Fiber.interrupt(entry.fiber).pipe(Effect.forkIn(scope));
                if (feeds.size === 0) yield* setStatus("idle");
              });
            }),
        ),
      });
    }),
  );
}

/**
 * Isolates synchronous view callbacks from the shared native workflow.
 * @param callback - One observer callback.
 * @returns Nothing; a view cannot fail another observer's lease.
 */
function safely(callback: () => void): void {
  try {
    callback();
  } catch {}
}
